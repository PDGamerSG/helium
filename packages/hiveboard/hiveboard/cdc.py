"""Agent wake-ups from Neo4j Change Data Capture.

Every tenant database is created with `txLogEnrichment: 'FULL'`, so Neo4j keeps the before and after state of
every changed node and relationship. `CdcTailer` polls `db.cdc.query` per tenant database, groups the change
records by transaction and translates them into the same `{event, payload}` messages the in-process bus carries
(`hiveboard.events.EVENT_NAMES`), then delivers them to the tenant's listeners. The writer may be this process,
the MCP server, the seed script or someone typing in Neo4j Browser: the agents wake either way, from the
database's own change log.

`translate_tx` is a pure function over the CDC records of one transaction so it can be unit tested without a
server. Record shape (Neo4j 5.13+ / 2025.x / 2026.x, FULL enrichment; `keys` is empty unless a NODE KEY
constraint exists, so nodes are identified by element id and resolved to their business `id`):

    {id, txId, seq, metadata: {...}, event: {elementId, eventType: 'n'|'r', operation: 'c'|'u'|'d',
        labels, keys,                                               # nodes
        type, start: {elementId, labels, keys}, end: {...},         # relationships
        state: {before: {properties, labels}, after: {properties, labels}}}}
"""

from __future__ import annotations

import logging
import threading
import time
from collections import defaultdict
from typing import Any

from .db import HiveDB, Neo4jError
from .temporal import now_ms

log = logging.getLogger("hiveboard.cdc")

SELECTORS: list[dict[str, Any]] = [
    {"select": "n", "labels": ["Fact"]},
    {"select": "n", "labels": ["Task"]},
    {"select": "n", "labels": ["Episode"]},
    {"select": "n", "labels": ["Skill"]},
    {"select": "n", "labels": ["Artifact"]},
    {"select": "r", "type": "SUPERSEDES"},
    {"select": "r", "type": "HANDED_OFF"},
    {"select": "r", "type": "HAS_EPISODE"},
    {"select": "r", "type": "RAN"},
    {"select": "r", "type": "USED"},
    {"select": "r", "type": "STEP"},
    {"select": "r", "type": "LEARNED_FROM"},
    {"select": "r", "type": "PRODUCED"},
]
_CDC_QUERY = (
    "CALL db.cdc.query($from, $selectors) YIELD id, txId, seq, metadata, event RETURN id, txId, seq, metadata, event"
)


# --------------------------------------------------------------------------- record helpers
def _props(ev: dict[str, Any] | None, which: str) -> dict[str, Any]:
    state = (ev or {}).get("state") or {}
    side = state.get(which) or {}
    return dict(side.get("properties") or {})


def _labels(ev: dict[str, Any]) -> list[str]:
    if ev.get("labels"):
        return list(ev["labels"])
    state = ev.get("state") or {}
    for side in ("after", "before"):
        labels = (state.get(side) or {}).get("labels")
        if labels:
            return list(labels)
    return []


def _fact_payload(props: dict[str, Any], labels: list[str]) -> dict[str, Any]:
    kind = props.get("kind") or ("commitment" if "Commitment" in labels else "decision" if "Decision" in labels else "fact")
    return {
        "id": props.get("id"),
        "kind": kind,
        "key": props.get("key"),
        "subject": props.get("subject"),
        "predicate": props.get("predicate"),
        "object": props.get("object"),
        "text": props.get("text"),
        "speaker_id": None,
        "episode_id": None,
        "due_at": props.get("due_at"),
    }


# --------------------------------------------------------------------------- translation
def translate_tx(records: list[dict[str, Any]], lookup_element=None) -> list[tuple[str, dict[str, Any]]]:
    """CDC records of ONE transaction (in `seq` order) -> `[(event_name, payload)]` in the bus's shapes.

    A relationship endpoint is resolved through the node records of the same transaction first, then through
    `lookup_element(element_id)`, which returns the node's properties plus a `labels` list (None when gone)."""
    out: list[tuple[str, dict[str, Any]]] = []
    events = [r.get("event") or {} for r in sorted(records, key=lambda r: r.get("seq") or 0)]
    nodes = [e for e in events if e.get("eventType") == "n"]
    rels = [e for e in events if e.get("eventType") == "r"]
    by_element: dict[str, dict[str, Any]] = {e.get("elementId"): e for e in nodes}
    cache: dict[str, tuple[str | None, dict[str, Any], list[str]]] = {}

    def resolve(ref: dict[str, Any] | None) -> tuple[str | None, dict[str, Any], list[str]]:
        """(id, properties, labels) of a node record or a relationship endpoint reference."""
        if not ref:
            return None, {}, []
        eid = ref.get("elementId") or ""
        ev = by_element.get(eid)
        if ev is not None:
            props = _props(ev, "after") or _props(ev, "before")
            return props.get("id"), props, _labels(ev)
        if eid not in cache:
            props = dict((lookup_element(eid) if lookup_element else None) or {})
            labels = list(props.pop("labels", None) or ref.get("labels") or [])
            cache[eid] = (props.get("id"), props, labels)
        return cache[eid]

    def rel_ids(ev: dict[str, Any]) -> tuple[str | None, str | None]:
        return resolve(ev.get("start"))[0], resolve(ev.get("end"))[0]

    created_rels = [e for e in rels if e.get("operation") == "c"]

    # -- facts ------------------------------------------------------------------------------
    for ev in nodes:
        labels = _labels(ev)
        if "Fact" in labels and ev.get("operation") == "c":
            payload = _fact_payload(_props(ev, "after"), labels)
            out.append(("fact.created", payload))
            if payload["kind"] == "commitment":
                out.append(("commitment.created", payload))
    supersedes: dict[str, list[str]] = defaultdict(list)
    new_info: dict[str, tuple[dict[str, Any], list[str]]] = {}
    old_object: dict[str, Any] = {}
    for ev in created_rels:
        if ev.get("type") != "SUPERSEDES":
            continue
        new_id, props, labels = resolve(ev.get("start"))
        old_id, old_props, _ = resolve(ev.get("end"))
        if not new_id or not old_id:
            continue
        supersedes[new_id].append(old_id)
        new_info[new_id] = (props, labels)
        old_ev = by_element.get((ev.get("end") or {}).get("elementId") or "")
        before = _props(old_ev, "before") if old_ev else {}
        old_object.setdefault(new_id, (before or old_props).get("object"))
    for new_id, old_ids in supersedes.items():
        props, labels = new_info[new_id]
        kind = props.get("kind") or ("commitment" if "Commitment" in labels else "decision" if "Decision" in labels else "fact")
        key = props.get("key")
        subject, predicate = props.get("subject"), props.get("predicate")
        if key and (subject is None or predicate is None) and "|" in key:
            subject, predicate = key.split("|", 1)
        payload = {
            "new_id": new_id,
            "old_ids": old_ids,
            "key": key,
            "kind": kind,
            "subject": subject,
            "predicate": predicate,
            "object": props.get("object"),
            "old_object": old_object.get(new_id),
            "due_at": props.get("due_at"),
            "head_changed": True,
        }
        out.append(("fact.superseded", payload))
        if kind == "commitment":
            out.append(("commitment.updated", {"id": new_id, "replaces": old_ids, "due_at": props.get("due_at")}))

    # -- episodes ---------------------------------------------------------------------------
    per_container: dict[str, int] = defaultdict(int)
    source_kind: dict[str, str] = {}
    for ev in created_rels:
        if ev.get("type") != "HAS_EPISODE":
            continue
        container = resolve(ev.get("start"))[0]
        if not container:
            continue
        per_container[container] += 1
        kind = resolve(ev.get("end"))[1].get("source_kind")
        if kind:
            source_kind.setdefault(container, kind)
    for container, count in per_container.items():
        out.append(("episode.ingested", {"container_id": container, "count": count, "source_kind": source_kind.get(container, "utterance")}))

    # -- tasks ------------------------------------------------------------------------------
    handoffs = {rel_ids(ev)[0]: ev for ev in created_rels if ev.get("type") == "HANDED_OFF"}
    artifacts = {rel_ids(ev)[0]: resolve(ev.get("end"))[1] for ev in created_rels if ev.get("type") == "PRODUCED"}
    for ev in nodes:
        if "Task" not in _labels(ev):
            continue
        after, before = _props(ev, "after"), _props(ev, "before")
        task_id = after.get("id") or before.get("id")
        if ev.get("operation") == "c":
            out.append(("task.submitted", {"task_id": task_id, "kind": after.get("kind"), "requires": [], "about": [], "priority": after.get("priority", 5)}))
            continue
        if ev.get("operation") != "u" or before.get("status") == after.get("status"):
            continue
        status, version, agent = after.get("status"), after.get("version"), after.get("owner_agent")
        if status == "working":
            out.append(("task.claimed", {"task_id": task_id, "agent_id": agent, "version": version}))
        elif status == "submitted" and task_id in handoffs:
            rel = _props(handoffs[task_id], "after")
            out.append(("task.handed_off", {"task_id": task_id, "from": rel.get("from_agent") or before.get("owner_agent"), "to": agent, "version": version, "summary": rel.get("summary"), "subgraph_ids": list(rel.get("subgraph_ids") or [])}))
        elif status == "completed":
            art = artifacts.get(task_id)
            out.append(("task.completed", {"task_id": task_id, "agent_id": agent, "version": version, "artifact": {k: art.get(k) for k in ("id", "kind", "uri", "text")} if art else None}))
        elif status == "failed":
            out.append(("task.failed", {"task_id": task_id, "agent_id": agent, "reason": after.get("failure_reason"), "version": version}))
        elif status == "input_required":
            out.append(("task.input_required", {"task_id": task_id, "agent_id": agent, "question": after.get("question"), "version": version}))

    # -- skills -----------------------------------------------------------------------------
    steps: dict[str, int] = defaultdict(int)
    learned: dict[str, list[str]] = defaultdict(list)
    used_by: dict[str, str] = {}
    for ev in created_rels:
        kind = ev.get("type")
        if kind == "STEP":
            steps[rel_ids(ev)[0] or ""] += 1
        elif kind == "LEARNED_FROM":
            sid, src = rel_ids(ev)
            learned[sid or ""].append(src or "")
        elif kind == "USED":
            task_id, sid = rel_ids(ev)
            used_by[sid or ""] = task_id or ""
    for ev in nodes:
        if "Skill" in _labels(ev) and ev.get("operation") == "c":
            props = _props(ev, "after")
            sid = props.get("id")
            out.append(("skill.learned", {"skill_id": sid, "goal": props.get("goal"), "steps": steps.get(sid, 0), "learned_from": [x for x in learned.get(sid, []) if x]}))
    skill_after = {_props(ev, "after").get("id"): _props(ev, "after") for ev in nodes if "Skill" in _labels(ev) and ev.get("operation") == "u"}
    for ev in created_rels:
        if ev.get("type") == "RAN":
            agent, sid = rel_ids(ev)
            rel = _props(ev, "after")
            after = skill_after.get(sid, {})
            out.append(("skill.ran", {"skill_id": sid, "agent_id": agent, "ok": rel.get("outcome") == "ok", "task_id": used_by.get(sid or ""), "runs": after.get("runs"), "success_rate": after.get("success_rate")}))
    return out


# --------------------------------------------------------------------------- the tailer
class CdcTailer:
    """One polling thread per tenant database. `start(tenants)` begins at the current change id (nothing is
    replayed); `ensure(tenant)` adds a tenant later; `stop()` ends every thread."""

    def __init__(self, db: HiveDB, poll_s: float = 0.5, selectors: list[dict[str, Any]] | None = None) -> None:
        self.db = db
        self.poll_s = poll_s
        self.selectors = selectors or SELECTORS
        self._threads: dict[str, threading.Thread] = {}
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self.delivered = 0

    def start(self, tenants: list[str]) -> None:
        self.db.cdc_active = True
        for tenant in tenants:
            self.ensure(tenant)
        log.info("cdc: tailing %s", ", ".join(tenants) or "no tenant yet")

    def ensure(self, tenant: str) -> None:
        with self._lock:
            if tenant in self._threads or self._stop.is_set():
                return
            thread = threading.Thread(target=self._loop, args=(tenant,), name=f"cdc-{tenant}", daemon=True)
            self._threads[tenant] = thread
            thread.start()

    def stop(self) -> None:
        self._stop.set()
        with self._lock:
            threads = list(self._threads.values())
            self._threads.clear()
        for thread in threads:
            thread.join(timeout=self.poll_s * 4 + 1)
        self.db.cdc_active = False

    # -- polling ----------------------------------------------------------------------------
    def _graph(self, tenant: str):
        # Resolve through HiveDB so the reader follows the same physical
        # database as writes when an Aura instance hosts one logical tenant.
        return self.db.database(self.db.graph(tenant).name, read_only=True)

    def _current(self, tenant: str) -> str:
        return self._graph(tenant).ro_query("CALL db.cdc.current() YIELD id RETURN id").result_set[0][0]

    def _lookup_element(self, tenant: str):
        def lookup(element_id: str) -> dict[str, Any] | None:
            rows = self._graph(tenant).ro_query(
                "MATCH (n) WHERE elementId(n) = $eid RETURN properties(n) AS props, labels(n) AS labels",
                {"eid": element_id},
                timeout=3000,
            ).result_set
            if not rows:
                return None
            props = dict(rows[0][0] or {})
            props.pop("embedding", None)
            props["labels"] = list(rows[0][1] or [])
            return props

        return lookup

    def poll_once(self, tenant: str, cursor: str) -> tuple[str, int]:
        """Read every change since `cursor`, deliver the translated events; returns (new cursor, delivered count)."""
        rows = self._graph(tenant).ro_query(_CDC_QUERY, {"from": cursor, "selectors": self.selectors}, timeout=10000).result_set
        if not rows:
            return cursor, 0
        by_tx: dict[Any, list[dict[str, Any]]] = defaultdict(list)
        for change_id, tx_id, seq, metadata, event in rows:
            by_tx[tx_id].append({"id": change_id, "txId": tx_id, "seq": seq, "metadata": metadata, "event": event})
        delivered = 0
        lookup = self._lookup_element(tenant)
        for tx_id, records in by_tx.items():
            user = (records[0].get("metadata") or {}).get("executingUser")
            for name, payload in translate_tx(records, lookup):
                self.db.dispatch(tenant, {"event": name, "payload": payload, "ts": now_ms(), "source": "cdc", "tx": tx_id, "user": user})
                delivered += 1
        self.delivered += delivered
        return rows[-1][0], delivered

    def _loop(self, tenant: str) -> None:
        cursor: str | None = None
        while not self._stop.is_set():
            try:
                if cursor is None:
                    cursor = self._current(tenant)
                cursor, _ = self.poll_once(tenant, cursor)
            except Neo4jError as exc:
                message = str(exc)
                if "not found" in message.lower() and "database" in message.lower():
                    log.info("cdc: database of %s is gone; stopping its tailer", tenant)
                    return
                log.warning("cdc poll for %s failed (%s); resetting the cursor", tenant, message[:160])
                cursor = None
                time.sleep(self.poll_s * 4)
            except Exception as exc:  # noqa: BLE001 - keep tailing
                log.warning("cdc poll for %s failed: %s", tenant, exc)
                time.sleep(self.poll_s * 4)
            self._stop.wait(self.poll_s)
