"""Change Data Capture: the translation of raw change records, and a live tailer delivering events written by
another connection (the way the MCP server or the seed script would)."""

import time

import hiveboard as hb
import pytest
from hiveboard.cdc import CdcTailer, translate_tx


def _node(eid, labels, after, before=None, op="c", key=None):
    return {
        "elementId": eid,
        "eventType": "n",
        "operation": op,
        "labels": labels,
        "keys": {labels[0]: [{"id": key or after.get("id")}]},
        "state": {"before": {"properties": before, "labels": labels} if before else None, "after": {"properties": after, "labels": labels}},
    }


def _rel(eid, type_, start, end, props=None):
    def ref(node):
        return {"elementId": node["elementId"], "labels": node["labels"], "keys": node["keys"]}

    return {"elementId": eid, "eventType": "r", "operation": "c", "type": type_, "start": ref(start), "end": ref(end), "state": {"before": None, "after": {"properties": props or {}}}}


def test_translate_tx_maps_change_records_to_bus_events():
    old = _node("n1", ["Fact", "Commitment"], {"id": "f_old", "status": "superseded", "object": "Thursday", "key": "upi flow|due", "kind": "commitment"}, before={"id": "f_old", "status": "active", "object": "Thursday", "key": "upi flow|due", "kind": "commitment"}, op="u")
    new_ref = _node("n2", ["Fact", "Commitment"], {"id": "f_new"})
    sup = _rel("r1", "SUPERSEDES", new_ref, old, {"at": 1})
    task_created = _node("n3", ["Task"], {"id": "t1", "kind": "followup", "status": "submitted", "version": 0, "priority": 5})
    task_claimed = _node("n3", ["Task"], {"id": "t1", "status": "working", "version": 1, "owner_agent": "agt_a"}, before={"id": "t1", "status": "submitted", "version": 0}, op="u")
    records = [{"seq": i, "event": e} for i, e in enumerate([old, sup, task_created, task_claimed])]
    looked_up = {"n2": {"id": "f_new", "kind": "commitment", "key": "upi flow|due", "object": "Friday", "due_at": 123, "labels": ["Fact", "Commitment"]}}
    events = translate_tx(records, lambda eid: looked_up.get(eid))
    names = [n for n, _ in events]
    assert names == ["fact.superseded", "commitment.updated", "task.submitted", "task.claimed"]
    sup_payload = dict(events)["fact.superseded"]
    assert sup_payload["new_id"] == "f_new" and sup_payload["old_ids"] == ["f_old"]
    assert sup_payload["subject"] == "upi flow" and sup_payload["predicate"] == "due"
    assert sup_payload["object"] == "Friday" and sup_payload["old_object"] == "Thursday" and sup_payload["head_changed"] is True
    assert dict(events)["task.claimed"] == {"task_id": "t1", "agent_id": "agt_a", "version": 1}


def test_cdc_tailer_delivers_events_written_through_another_connection(db, tenant, seeded):
    if not db.capabilities().get("cdc"):
        pytest.skip("Change Data Capture needs Neo4j Enterprise")
    tailer = CdcTailer(db, poll_s=0.2)
    received: list[dict] = []
    db.add_listener(tenant, received.append)
    tailer.start([tenant])
    try:
        assert db.cdc_active is True
        # a second HiveDB plays the role of another process (the MCP server, the seed script, a Cypher shell)
        other = hb.HiveDB(db.uri, db.user, db.password)
        try:
            hb.register_agent(other, tenant, "agt_cdc", "CDC", ["followup"], "m")
            task = hb.submit_task(other, tenant, "followup", {"x": 1}, ["followup"])
            assert hb.claim(other, tenant, task, "agt_cdc", 0) == 1
            moved = hb.supersede_fact(
                other,
                tenant,
                seeded["fact"],
                {"subject": "UPI flow", "predicate": "due", "object": "2026-09-25", "kind": "commitment", "speaker_id": seeded["priya"], "episode_id": "ep2", "valid_from": 5, "due_at": 99},
            )
            hb.complete(other, tenant, task, "agt_cdc", {"kind": "note", "text": "done"})
        finally:
            other.close()
        deadline = time.time() + 15
        while time.time() < deadline and len([e for e in received if e["event"] == "task.completed"]) == 0:
            time.sleep(0.2)
        names = [e["event"] for e in received]
        assert names.count("task.submitted") == 1 and "task.claimed" in names and "task.completed" in names
        assert "fact.created" in names and "fact.superseded" in names and "commitment.updated" in names
        sup = next(e for e in received if e["event"] == "fact.superseded")
        assert sup["source"] == "cdc" and sup["payload"]["new_id"] == moved["id"] and sup["payload"]["old_ids"] == [seeded["fact"]]
        assert sup["payload"]["object"] == "2026-09-25" and sup["payload"]["old_object"] == "Thursday" and sup["payload"]["predicate"] == "due"
        done = next(e for e in received if e["event"] == "task.completed")
        assert done["payload"]["artifact"]["kind"] == "note" and done["payload"]["agent_id"] == "agt_cdc"
        # the writer-side publish only records in CDC mode: no duplicate delivery
        assert names.count("task.claimed") == 1
    finally:
        tailer.stop()
        db.remove_listener(tenant, received.append)
    assert db.cdc_active is False
