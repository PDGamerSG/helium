"""The company activity fixture has real graph links and can be replayed safely."""

import json
from collections import Counter
from pathlib import Path

from apps.api.ingest_service import load_roster
from data.seed import _import, discover
from data.seed_activity import import_activity


def test_activity_links_evidence_and_is_repeatable(ctx):
    seeded = ctx
    root = Path(__file__).resolve().parents[3] / "data"
    seeded.settings.data_dir = str(root)
    roster = load_roster(root, "orbit")
    for kind, path in discover(root / "meetings", "orbit"):
        source = json.loads(path.read_text())
        _import(seeded, "orbit", kind, source, path.stem, roster, "gold")
    assert import_activity(seeded, "orbit") == {"created": 8, "existing": 0}
    tasks = seeded.hive.list_tasks("orbit")
    assert Counter(t["status"] for t in tasks) == {"completed": 4, "working": 2, "input_required": 1, "submitted": 1}
    assert all(t["about"] for t in tasks)
    handed = next(t for t in tasks if t["kind"] == "payment_runbook_review")
    trace = seeded.hive.task_trace("orbit", handed["id"])
    assert {e["type"] for e in trace["events"]} >= {"claimed", "handed_off", "artifact", "completed"}
    routines = seeded.hive.list_skills("orbit")
    assert any(s["runs"] == 2 and s["success_rate"] == 1 for s in routines)
    assert import_activity(seeded, "orbit") == {"created": 0, "existing": 8}
    assert {t["id"] for t in seeded.hive.list_tasks("orbit")} == {t["id"] for t in tasks}
    assert seeded.hive.list_skills("orbit") == routines
    assert seeded.hive.list_tasks("nimbus") == []
