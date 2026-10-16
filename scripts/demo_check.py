"""Rehearsal check: every beat of the demo, run against the live API, with PASS/FAIL and timings.

    uv run --package helium-api python scripts/demo_check.py [--api http://127.0.0.1:8081] [--tenant orbit]
        [--real-tenant remote] [--with-llm] [--move-to 2026-10-02] [--skip-supersede]

Exit code 1 when any beat fails. `--with-llm` also asks the chat endpoint the UPI question (needs the model).
`--skip-supersede` leaves the "move it to Friday" beat out (it supersedes the PayU commitment every run).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import UTC, datetime
from typing import Any, Callable

import httpx

SEP_10_2026 = int(datetime(2026, 9, 10, 23, 59, 59, tzinfo=UTC).timestamp() * 1000)
CONCEPTUAL_DONE = int(datetime(2004, 12, 13, 15, 0, 0, tzinfo=UTC).timestamp() * 1000)


class Check:
    def __init__(self, api: str) -> None:
        self.client = httpx.Client(base_url=api, timeout=120.0)
        self.rows: list[tuple[str, bool, str, float]] = []

    def run(self, name: str, fn: Callable[[], str]) -> None:
        started = time.perf_counter()
        try:
            detail = fn()
            ok = True
        except Exception as exc:  # noqa: BLE001 - every failure is reported, none aborts the run
            detail, ok = f"{type(exc).__name__}: {exc}"[:160], False
        self.rows.append((name, ok, detail, time.perf_counter() - started))
        print(f"{'PASS' if ok else 'FAIL'}  {name:<42} {time.perf_counter() - started:6.1f}s  {detail}", flush=True)

    def get(self, path: str, **params: Any) -> Any:
        response = self.client.get(path, params=params)
        response.raise_for_status()
        return response.json()

    def post(self, path: str, body: dict | None = None) -> Any:
        response = self.client.post(path, json=body or {})
        response.raise_for_status()
        return response.json()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api", default="http://127.0.0.1:8081")
    parser.add_argument("--tenant", default="orbit")
    parser.add_argument("--other", default="nimbus", help="tenant the access probe must be refused on")
    parser.add_argument("--real-tenant", default="remote", help="the AMI tenant ('' to skip)")
    parser.add_argument("--with-llm", action="store_true")
    parser.add_argument("--move-to", default="2026-10-02")
    parser.add_argument("--skip-supersede", action="store_true")
    args = parser.parse_args()
    c = Check(args.api)
    t = args.tenant

    def health() -> str:
        h = c.get("/health")
        assert h["ok"] and h["neo4j"]["kind"] == "neo4j", h
        return f"neo4j {h['neo4j']['version']}, events={h['neo4j']['events']}, {len(h['workers'])} workers, {len(h['neo4j']['databases'])} databases"

    def tenants() -> str:
        rows = {x["slug"]: x for x in c.get("/tenants")}
        assert t in rows and args.other in rows, list(rows)
        assert rows[t]["graph"].startswith("team-") and rows[t]["nodes"] > 100
        return ", ".join(f"{s}: {x['nodes']} nodes" for s, x in rows.items())

    def probe() -> str:
        p = c.get(f"/tenants/{t}/acl-probe", target=args.other)
        assert p["allowed"] is False and "not allowed" in (p["error"] or ""), p
        return p["error"][:90]

    def belief() -> str:
        rows = c.get(f"/tenants/{t}/belief", t=SEP_10_2026)["facts"]
        objs = {(f["subject"].lower(), f["predicate"]): f["object"] for f in rows}
        assert objs.get(("orbit navigation", "uses_pattern")) == "bottom tab bar", objs.get(("orbit navigation", "uses_pattern"))
        assert objs.get(("payments service", "uses_vendor")) == "Razorpay", objs.get(("payments service", "uses_vendor"))
        assert objs.get(("upi flow", "due")) == "2026-09-24", objs.get(("upi flow", "due"))
        return "10 Sep: bottom tab bar, Razorpay, UPI due 24 Sep"

    def who_knows() -> str:
        rows = c.get(f"/tenants/{t}/analytics/who-knows", entity="PayU")
        assert rows and rows[0]["person"]["name"] == "Priya", rows[:2]
        return ", ".join(f"{r['person']['name']} ({r['mentions']})" for r in rows[:3])

    def search() -> str:
        s = c.get(f"/tenants/{t}/search", q="who owns the payments vendor decision", k=3)
        assert s["retriever"].endswith("HybridCypherRetriever") and s["items"], s.get("retriever")
        return f"{len(s['items'])} items via {s['retriever'].split('.')[-1]}"

    def double_claim() -> str:
        r = c.post(f"/tenants/{t}/demo/double-claim")
        assert r["winners"] == 1 and r["losers"] == r["attempts"] - 1, r
        return f"winners {r['winners']}, losers {r['losers']}"

    def skills() -> str:
        rows = c.get(f"/tenants/{t}/skills")
        assert rows, "no skill learned"
        return f"{len(rows)} skill(s), first: {rows[0]['goal'][:50]}"

    def supersede() -> str:
        r = c.post(f"/tenants/{t}/demo/supersede", {"new_object": args.move_to})
        deadline = time.time() + 90
        task = None
        while time.time() < deadline:
            tasks = [x for x in c.get(f"/tenants/{t}/tasks", limit=10) if x["kind"] == "reschedule"]
            if tasks and tasks[0]["status"] in ("completed", "failed"):
                task = tasks[0]
                break
            time.sleep(2)
        assert task and task["status"] == "completed", task
        trace = c.get(f"/tenants/{t}/tasks/{task['id']}/trace")
        types = [e["type"] for e in trace["events"]]
        assert "handed_off" in types and "completed" in types, types
        return f"{r['subject']} {r['old_object']} -> {r['new_object']}; trace {types}"

    def events_cdc() -> str:
        with c.client.stream("GET", f"/tenants/{t}/events", params={"replay": 30, "limit": 30}, timeout=8.0) as stream:
            lines = []
            try:
                for line in stream.iter_lines():
                    if line.startswith("data:"):
                        lines.append(json.loads(line[5:]))
            except httpx.ReadTimeout:
                pass
        sources = {e.get("source") for e in lines if e.get("event") != "connected"}
        assert "cdc" in sources, f"no cdc-sourced event in {len(lines)} events ({sources})"
        return f"{len(lines)} events, sources {sorted(s for s in sources if s)}"

    def chat() -> str:
        a = c.post(f"/tenants/{t}/chat", {"message": "When is the UPI flow due?"})
        assert "28" in a["answer"], a["answer"][:200]
        return f"{a['model']} {a['latency_ms']} ms, {len(a['sources'])} sources, {len(a['subgraph']['nodes'])} nodes"

    def real_meetings() -> str:
        rows = c.get(f"/tenants/{args.real_tenant}/meetings")
        assert len(rows) >= 4 and all(m["episodes"] > 0 for m in rows), [(m["id"], m["episodes"]) for m in rows]
        head = c.client.head(f"/tenants/{args.real_tenant}/meetings/{rows[0]['id']}/audio")
        assert head.status_code == 200, f"audio {head.status_code}"
        return f"{len(rows)} meetings, {sum(m['episodes'] for m in rows)} episodes, audio ok"

    def real_battery() -> str:
        rows = c.get(f"/tenants/{args.real_tenant}/facts", status="all")
        battery = sorted((f for f in rows if (f["subject"] or "").lower() == "battery"), key=lambda f: f["valid_from"] or 0)
        assert battery, "no battery fact"
        chain = [f["object"] for f in battery]
        belief_rows = c.get(f"/tenants/{args.real_tenant}/belief", t=CONCEPTUAL_DONE)["facts"]
        then = {(f["subject"].lower(), f["predicate"]): f["object"] for f in belief_rows}
        return f"battery chain {chain}; after conceptual design: battery={then.get(('battery', 'decided'))}, LCD display={then.get(('lcd display', 'decided'))}"

    c.run("health", health)
    c.run("tenants on Neo4j databases", tenants)
    c.run("access probe refused by RBAC", probe)
    c.run("belief at 10 September", belief)
    c.run("who knows PayU", who_knows)
    c.run("neo4j-graphrag search", search)
    c.run("double claim: one winner", double_claim)
    c.run("learned skill present", skills)
    if not args.skip_supersede:
        c.run("supersede -> scheduler -> followup", supersede)
        c.run("events carry source=cdc", events_cdc)
    if args.with_llm:
        c.run("chat: UPI flow due (model)", chat)
    if args.real_tenant:
        c.run("AMI meetings + audio", real_meetings)
        c.run("AMI battery chain", real_battery)
    failed = [r for r in c.rows if not r[1]]
    print(f"\n{len(c.rows) - len(failed)} passed, {len(failed)} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
