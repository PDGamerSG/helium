"""Load harness: N simulated agents across M tenant graphs, 80 % reads (recall / active_facts / list_tasks) and
20 % writes (remember_fact / claim / complete), latency percentiles per class, plus a CAS contention test where
K agents race for one task per tenant and exactly one must win. Writes
`docs/bench/<engine>-<target>-<agents>x<tenants>-<timestamp>.json`.

    uv run --package hiveboard python -m bench.harness --agents 20 --tenants 4 --duration 20 --target local

Server version and edition, a few effective settings, server CPU seconds (JVM process CPU via JMX, Enterprise),
client CPU seconds and an error breakdown by message are written with the results. One Neo4j database per tenant.

One Python process tops out at about one core (GIL), so at high agent counts the client, not Neo4j, sets the
latency. `--procs P` splits the agents across P worker processes (each with its own driver and its share
of the open tasks); seeding and the CAS race stay in the parent. `--procs 1` (default) is the original mode.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
import platform
import random
import re
import threading
import time
from collections import Counter, deque
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import hiveboard as hb
from hiveboard.embed import fake_embedding
from hiveboard.queries import _PKG_DIR

READ_OPS = ("recall", "active_facts", "list_tasks")
WRITE_OPS = ("remember_fact", "claim", "complete")
QUERIES = (
    "when is the UPI flow due",
    "who owns the payments gateway",
    "what did we decide about onboarding",
    "status of the android release",
    "customer escalation from Acme",
    "standup summary",
)
SUBJECTS = ("UPI flow", "payments gateway", "onboarding", "android release", "Acme escalation", "standup")
PREDICATES = ("due", "owner", "status", "priority")
OBJECTS = (
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Priya",
    "Aditya",
    "Rahul",
    "high",
    "blocked",
)


def percentile(values: list[float], p: float) -> float | None:
    """Nearest-rank percentile in ms, rounded to 3 decimals; None when there are no samples."""
    if not values:
        return None
    ordered = sorted(values)
    idx = max(0, min(len(ordered) - 1, math.ceil(p / 100 * len(ordered)) - 1))
    return round(ordered[idx], 3)


@dataclass
class Stats:
    reads: list[float] = field(default_factory=list)
    writes: list[float] = field(default_factory=list)
    by_op: dict[str, list[float]] = field(default_factory=dict)
    errors: int = 0
    error_samples: list[str] = field(default_factory=list)
    error_kinds: Counter = field(default_factory=Counter)
    lock: threading.Lock = field(default_factory=threading.Lock)

    def record(self, op: str, is_read: bool, ms: float) -> None:
        with self.lock:
            (self.reads if is_read else self.writes).append(ms)
            self.by_op.setdefault(op, []).append(ms)

    def error(self, exc: Exception) -> None:
        with self.lock:
            self.errors += 1
            self.error_kinds[error_kind(exc)] += 1
            if len(self.error_samples) < 10:
                self.error_samples.append(f"{type(exc).__name__}: {str(exc)[:160]}")


def error_kind(exc: Exception) -> str:
    """Group errors by type and first message line with ids and numbers masked."""
    text = str(exc).splitlines()[0][:100] if str(exc) else ""
    return f"{type(exc).__name__}: {re.sub(r'[0-9a-z]{26}|[0-9]+', '#', text)}"


@dataclass
class TenantSeed:
    tenant: str
    people: list[str]
    entities: list[str]
    agents: list[str]
    submitted: deque = field(default_factory=deque)
    working: deque = field(default_factory=deque)
    lock: threading.Lock = field(default_factory=threading.Lock)


def seed_tenant(db: hb.HiveDB, tenant: str, rng: random.Random) -> TenantSeed:
    """Schema + a small realistic graph: people, one meeting with episodes, entities, facts, agents and open tasks."""
    hb.ensure_schema(db, tenant)
    people = hb.remember_people(
        db, tenant, [{"name": n, "role": "eng"} for n in ("Priya", "Aditya", "Rahul", "Meera")]
    )
    meeting = hb.remember_meeting(db, tenant, {"title": "Kickoff", "started_at": hb.now_ms() - 7 * 86400000})
    base = hb.now_ms() - 7 * 86400000
    episodes = [
        {
            "id": f"ep_{tenant}_{i}",
            "seq": i,
            "speaker_id": people[i % 4],
            "text": f"{SUBJECTS[i % 6]} {PREDICATES[i % 4]} {OBJECTS[i % 10]}",
            "t_start": i * 30000,
            "t_end": i * 30000 + 25000,
            "t_occurred": base + i * 30000,
            "embedding": fake_embedding(f"{SUBJECTS[i % 6]} {PREDICATES[i % 4]} {OBJECTS[i % 10]}"),
        }
        for i in range(12)
    ]
    hb.remember_episodes(db, tenant, meeting, episodes)
    ids = hb.upsert_entities(
        db, tenant, [{"name": s, "type": "topic", "embedding": fake_embedding(s)} for s in SUBJECTS]
    )
    entities = list(ids.values())
    for i, ep in enumerate(episodes):
        hb.link_mentions(db, tenant, ep["id"], [entities[i % 6], entities[(i + 1) % 6]])
    for i in range(30):
        subject, predicate = SUBJECTS[i % 6], PREDICATES[(i // 6) % 4]
        hb.remember_fact(
            db,
            tenant,
            {
                "subject": subject,
                "predicate": predicate,
                "object": OBJECTS[rng.randrange(10)],
                "text": f"{subject} {predicate} {OBJECTS[i % 10]}",
                "confidence": 0.6 + 0.4 * rng.random(),
                "speaker_id": people[i % 4],
                "episode_id": episodes[i % 12]["id"],
                "entity_ids": [ids[subject]],
                "kind": ("fact", "decision", "commitment")[i % 3],
                "embedding": fake_embedding(f"{subject} {predicate}"),
            },
            supersede=True,
        )
    agents = [f"agt_{tenant}_{i}" for i in range(3)]
    for i, agent in enumerate(agents):
        hb.register_agent(db, tenant, agent, f"Agent {i}", ["followup", "schedule", "answer"], "bench")
    seed = TenantSeed(tenant, people, entities, agents)
    for _ in range(10):
        seed.submitted.append(hb.submit_task(db, tenant, "followup", {"n": 1}, ["followup"]))
    return seed


def run_op(db: hb.HiveDB, seed: TenantSeed, op: str, agent: str, rng: random.Random) -> None:
    """One operation of the mix; each branch is exactly one hiveboard call."""
    tenant = seed.tenant
    if op == "recall":
        hb.recall(db, tenant, fake_embedding(rng.choice(QUERIES)), k=8)
    elif op == "active_facts":
        hb.active_facts(db, tenant, entity_id=rng.choice(seed.entities))
    elif op == "list_tasks":
        hb.list_tasks(db, tenant, status="submitted", limit=20)
    elif op == "remember_fact":
        subject = rng.choice(SUBJECTS)
        hb.remember_fact(
            db,
            tenant,
            {
                "subject": subject,
                "predicate": rng.choice(PREDICATES),
                "object": rng.choice(OBJECTS),
                "text": f"{subject} update by {agent}",
                "confidence": 0.9,
                "speaker_id": rng.choice(seed.people),
                "episode_id": f"ep_{tenant}_{rng.randrange(12)}",
                "entity_ids": [rng.choice(seed.entities)],
                "kind": "fact",
                "embedding": fake_embedding(f"{subject} update"),
            },
            supersede=True,
        )
    elif op == "claim":
        with seed.lock:
            task_id = seed.submitted.popleft() if seed.submitted else None
        if task_id is None:
            seed.submitted.append(hb.submit_task(db, tenant, "followup", {"n": 2}, ["followup"]))
            return
        if hb.claim(db, tenant, task_id, agent, 0) is not None:
            with seed.lock:
                seed.working.append((task_id, agent))
    elif op == "complete":
        with seed.lock:
            item = seed.working.popleft() if seed.working else None
        if item is None:
            seed.submitted.append(hb.submit_task(db, tenant, "followup", {"n": 3}, ["followup"]))
            return
        hb.complete(db, tenant, item[0], item[1], {"kind": "note", "text": "done"})
    else:
        raise ValueError(op)


async def agent_loop(
    db: hb.HiveDB,
    index: int,
    seeds: list[TenantSeed],
    stats: Stats,
    deadline: float,
    read_ratio: float,
    seed_value: int,
    read_ops: tuple[str, ...] = READ_OPS,
) -> int:
    """One simulated agent: pick a tenant, pick an op by the read ratio, time it, until the deadline."""
    rng = random.Random(seed_value)
    agent = f"agt_{seeds[index % len(seeds)].tenant}_{index % 3}"
    ops = 0
    while time.perf_counter() < deadline:
        seed = seeds[rng.randrange(len(seeds))]
        is_read = rng.random() < read_ratio
        op = rng.choice(read_ops if is_read else WRITE_OPS)
        t0 = time.perf_counter()
        try:
            await asyncio.to_thread(run_op, db, seed, op, agent, rng)
            stats.record(op, is_read, (time.perf_counter() - t0) * 1000)
            ops += 1
        except Exception as exc:  # noqa: BLE001 - the harness keeps going and reports the error count
            stats.error(exc)
    return ops


def _worker_stats(stats: Stats) -> dict:
    return {
        "reads": stats.reads,
        "writes": stats.writes,
        "by_op": stats.by_op,
        "errors": stats.errors,
        "error_samples": stats.error_samples,
        "error_kinds": dict(stats.error_kinds),
    }


def worker_main(job: dict) -> dict:
    """Entry point of one `--procs` worker: rebuild its tenant seeds, wait for the shared start time, run its agents."""
    db = hb.HiveDB(job["uri"])
    seeds = [
        TenantSeed(d["tenant"], d["people"], d["entities"], d["agents"], deque(d["submitted"]))
        for d in job["seeds"]
    ]
    stats = Stats()

    async def go() -> list[int]:
        asyncio.get_running_loop().set_default_executor(
            ThreadPoolExecutor(max_workers=len(job["agent_ids"]) + 4)
        )
        while time.time() < job["start_at"]:
            await asyncio.sleep(0.01)
        deadline = time.perf_counter() + job["duration"]
        return await asyncio.gather(
            *[
                agent_loop(
                    db, i, seeds, stats, deadline, job["read_ratio"], job["seed"] + i, tuple(job["read_ops"])
                )
                for i in job["agent_ids"]
            ]
        )

    cpu0 = time.process_time()
    ops = asyncio.run(go())
    out = _worker_stats(stats)
    out["ops"] = int(sum(ops))
    out["client_cpu_s"] = time.process_time() - cpu0
    db.close()
    return out


def run_procs(
    args: argparse.Namespace, seeds: list[TenantSeed], read_ops: tuple[str, ...]
) -> tuple[Stats, int, float]:
    """Fan the agents out over `args.procs` processes; merge their samples into one Stats."""
    import bench.harness as module  # noqa: PLW0406 - pickle the worker by its importable name, not __main__

    procs = args.procs
    start_at = time.time() + 3.0 + 0.5 * procs  # time for spawned interpreters to import hiveboard
    jobs = []
    for w in range(procs):
        jobs.append(
            {
                "uri": args.uri,
                "seeds": [
                    {
                        "tenant": sd.tenant,
                        "people": sd.people,
                        "entities": sd.entities,
                        "agents": sd.agents,
                        "submitted": list(sd.submitted)[w::procs],
                    }
                    for sd in seeds
                ],
                "agent_ids": list(range(w, args.agents, procs)),
                "start_at": start_at,
                "duration": args.duration,
                "read_ratio": args.read_ratio,
                "seed": args.seed,
                "read_ops": list(read_ops),
            }
        )
    with ProcessPoolExecutor(max_workers=procs) as pool:
        parts = list(pool.map(module.worker_main, jobs))
    stats = Stats()
    for part in parts:
        stats.reads.extend(part["reads"])
        stats.writes.extend(part["writes"])
        for op, values in part["by_op"].items():
            stats.by_op.setdefault(op, []).extend(values)
        stats.errors += part["errors"]
        stats.error_samples.extend(part["error_samples"][: max(0, 10 - len(stats.error_samples))])
        stats.error_kinds.update(part["error_kinds"])
    return stats, sum(p["ops"] for p in parts), sum(p["client_cpu_s"] for p in parts)


async def cas_contention(db: hb.HiveDB, seeds: list[TenantSeed], racers: int) -> dict:
    """K agents race for one fresh task per tenant; exactly one claim must return a version."""
    attempts = winners = 0
    per_tenant = []
    for seed in seeds:
        task_id = hb.submit_task(db, seed.tenant, "race", {}, ["followup"])
        results = await asyncio.gather(
            *[
                asyncio.to_thread(hb.claim, db, seed.tenant, task_id, seed.agents[i % 3], 0)
                for i in range(racers)
            ]
        )
        won = sum(1 for r in results if r is not None)
        attempts += racers
        winners += won
        per_tenant.append({"tenant": seed.tenant, "task_id": task_id, "attempts": racers, "winners": won})
    # A violation is recorded (and printed by main) instead of raised, so the latency results are still written.
    violations = [t["tenant"] for t in per_tenant if t["winners"] != 1]
    return {
        "attempts": attempts,
        "winners": winners,
        "losers": attempts - winners,
        "violations": violations,
        "per_tenant": per_tenant,
    }


def _text(value):
    return value.decode() if isinstance(value, bytes) else value


def server_config(db: hb.HiveDB) -> dict:
    """Version, edition and a few effective settings; a setting the server lacks is recorded as an error string."""
    out: dict = dict(db.capabilities())
    try:
        rows = db.system().query(
            "SHOW SETTINGS YIELD name, value WHERE name IN ['server.memory.heap.max_size', 'server.memory.pagecache.size', "
            "'db.transaction.timeout', 'dbms.cypher.runtime'] RETURN name, value"
        ).result_set
        out.update({name: value for name, value in rows})
    except Exception as exc:  # noqa: BLE001
        out["settings"] = f"error: {exc}"
    return out


def server_cpu(db: hb.HiveDB) -> float | None:
    """JVM process CPU seconds (java.lang:type=OperatingSystem ProcessCpuTime via JMX; Enterprise only)."""
    try:
        row = db.system().query(
            "CALL dbms.queryJmx('java.lang:type=OperatingSystem') YIELD attributes RETURN attributes.ProcessCpuTime.value"
        ).result_set[0]
        return float(row[0]) / 1e9
    except Exception:  # noqa: BLE001
        return None


def prepare_capabilities(db: hb.HiveDB) -> dict:
    """Every read op is available on Neo4j (ranking is inline Cypher); record what the server offers."""
    return {"capabilities": db.capabilities(), "read_ops": list(READ_OPS)}


def memory_usage(db: hb.HiveDB, tenant: str) -> dict:
    """Node and relationship counts of the tenant database (Neo4j exposes no per-database memory figure)."""
    out: dict = {}
    try:
        usage = db.usage(tenant)
        out["total_mb"] = usage["total_mb"]
        out["nodes"] = usage["nodes"]
        out["edges"] = usage["edges"]
    except Exception as exc:  # noqa: BLE001
        out["nodes"] = f"error: {exc}"
    return out


def repo_root() -> Path:
    return _PKG_DIR.parents[2]


async def run(args: argparse.Namespace) -> dict:
    """Seed, run the mixed load, run the CAS test, clean up, return the result document."""
    db = hb.HiveDB(args.uri)
    if not db.ping():
        raise SystemExit(f"Neo4j not reachable at {db.uri}")
    capabilities = prepare_capabilities(db)
    read_ops = tuple(capabilities["read_ops"])
    engine = args.engine or f"neo4j-{db.server_version()}"
    config = server_config(db)
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    run_id = f"{engine}-{args.target}-{args.agents}x{args.tenants}-{stamp}"
    asyncio.get_running_loop().set_default_executor(
        ThreadPoolExecutor(max_workers=args.agents + args.cas_agents + 4)
    )
    rng = random.Random(args.seed)
    tenants = [f"bench{i}" for i in range(args.tenants)]
    for tenant in tenants:
        if db.graph_exists(db.graph_name(tenant)):
            db.drop_database(db.graph_name(tenant))
    t_seed = time.perf_counter()
    seeds = [await asyncio.to_thread(seed_tenant, db, tenant, rng) for tenant in tenants]
    seed_s = time.perf_counter() - t_seed

    if args.procs > 1:
        cpu0 = server_cpu(db)
        stats, total_ops, client_cpu = await asyncio.to_thread(run_procs, args, seeds, read_ops)
        cpu1 = server_cpu(db)
        elapsed = args.duration  # every worker runs exactly `duration` from the shared start time
        ops = [total_ops]
        client0, client1 = 0.0, client_cpu
    else:
        stats = Stats()
        cpu0, client0 = server_cpu(db), time.process_time()
        deadline = time.perf_counter() + args.duration
        t_load = time.perf_counter()
        ops = await asyncio.gather(
            *[
                agent_loop(db, i, seeds, stats, deadline, args.read_ratio, args.seed + i, read_ops)
                for i in range(args.agents)
            ]
        )
        elapsed = time.perf_counter() - t_load
        cpu1, client1 = server_cpu(db), time.process_time()
    cas = await cas_contention(db, seeds, args.cas_agents)
    memory = {s.tenant: memory_usage(db, s.tenant) for s in seeds}
    usage = {t: m["total_mb"] for t, m in memory.items()}
    server_busy = None if cpu0 is None or cpu1 is None else round(cpu1 - cpu0, 2)

    result = {
        "run_id": run_id,
        "ts": hb.now_ms(),
        "engine": engine,
        "target": args.target,
        "agents": args.agents,
        "tenants": args.tenants,
        "duration_s": round(elapsed, 2),
        "read_p50": percentile(stats.reads, 50),
        "read_p95": percentile(stats.reads, 95),
        "read_p99": percentile(stats.reads, 99),
        "write_p50": percentile(stats.writes, 50),
        "write_p95": percentile(stats.writes, 95),
        "write_p99": percentile(stats.writes, 99),
        "errors": stats.errors,
        "cas": {k: cas[k] for k in ("attempts", "winners", "losers")},
        "cas_violations": cas["violations"],
        "cas_per_tenant": cas["per_tenant"],
        "ops": {
            "total": int(sum(ops)),
            "reads": len(stats.reads),
            "writes": len(stats.writes),
            "per_second": round(sum(ops) / elapsed, 1) if elapsed else None,
            "read_ratio": args.read_ratio,
        },
        "per_op": {
            op: {"n": len(v), "p50": percentile(v, 50), "p95": percentile(v, 95), "p99": percentile(v, 99)}
            for op, v in sorted(stats.by_op.items())
        },
        "error_samples": stats.error_samples,
        "error_kinds": dict(stats.error_kinds.most_common()),
        "usage_mb": usage,
        "memory": memory,
        "server": config,
        "capabilities": {**capabilities["capabilities"], "read_ops": list(read_ops)},
        "cpu": {
            "server_cpu_s": server_busy,
            "server_cores_busy": None if server_busy is None else round(server_busy / elapsed, 2),
            "client_cpu_s": round(client1 - client0, 2),
            "client_cores_busy": round((client1 - client0) / elapsed, 2),
        },
        "note": args.note,
        "seed_s": round(seed_s, 2),
        "latency_unit": "ms",
        "client": {
            "python": platform.python_version(),
            "os": platform.platform(),
            "mode": "asyncio.to_thread over the neo4j sync driver (managed transactions)",
            "procs": args.procs,
            "cpu": platform.processor(),
            "logical_cpus": os.cpu_count(),
        },
    }
    if not args.keep:
        for seed in seeds:
            db.drop_database(db.graph_name(seed.tenant))
    db.close()
    return result


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--agents", type=int, default=20, help="simulated agents (concurrent loops)")
    parser.add_argument("--tenants", type=int, default=4, help="tenant databases team-bench0..N-1")
    parser.add_argument("--duration", type=float, default=20.0, help="seconds of mixed load")
    parser.add_argument("--engine", default=None, help="engine label, default: neo4j-<detected version>")
    parser.add_argument("--target", default="local", help="target label: local | aura | ...")
    parser.add_argument("--uri", "--url", dest="uri", default=None, help="bolt://host:7687 (default $NEO4J_URI or localhost)")
    parser.add_argument(
        "--cas-agents", type=int, default=25, help="racers per tenant in the CAS contention test"
    )
    parser.add_argument("--read-ratio", type=float, default=0.8)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--keep", action="store_true", help="keep the bench graphs after the run")
    parser.add_argument(
        "--procs",
        type=int,
        default=1,
        help="client worker processes the agents are split across (GIL relief)",
    )
    parser.add_argument(
        "--note", default=None, help="free-text note stored in the result (machine, conditions)"
    )
    parser.add_argument("--out", default=None, help="output JSON path (default docs/bench/<run_id>.json)")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    result = asyncio.run(run(args))
    out = Path(args.out) if args.out else repo_root() / "docs" / "bench" / f"{result['run_id']}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    summary = {
        k: result[k]
        for k in (
            "run_id",
            "engine",
            "agents",
            "tenants",
            "duration_s",
            "read_p50",
            "read_p95",
            "read_p99",
            "write_p50",
            "write_p95",
            "write_p99",
            "errors",
            "cas",
            "cas_violations",
            "error_kinds",
            "cpu",
            "capabilities",
        )
    }
    summary["ops"] = result["ops"]
    print(json.dumps(summary, indent=2))
    print(f"written {out}")


if __name__ == "__main__":
    main()
