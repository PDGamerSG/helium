"""Seed repeatable fictional crew activity after data/seed.py and data/seed_work.py.

    uv run --package helium-api python data/seed_activity.py --tenants orbit

Uses normal task transitions and stores internal artifacts only. No messages are sent.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from apps.api.main import build_context

ROUTINE_GOAL = "Prepare Orbit launch readiness brief"


def import_activity(ctx, tenant: str) -> dict[str, int]:
    path = ctx.settings.data_path / "activity" / f"{tenant}.json"
    if not path.is_file():
        return {"created": 0, "existing": 0}
    fixture = json.loads(path.read_text(encoding="utf-8"))
    ctx.ensure_tenant(tenant)
    hive = ctx.hive
    existing = {t["payload"].get("demo_ref"): t for t in hive.list_tasks(tenant, limit=500) if t.get("payload")}
    facts = hive.list_facts(tenant, status="active")
    skills = hive.list_skills(tenant)
    routine = next((s["id"] for s in skills if s["goal"] == ROUTINE_GOAL), None)
    created = skipped = 0
    for item in fixture["tasks"]:
        ref = f"{tenant}-company-v1:{item['ref']}"
        if ref in existing:
            skipped += 1
            continue
        subjects = {s.casefold() for s in item["subjects"]}
        about = [f["id"] for f in facts if f["subject"].casefold() in subjects]
        if not about:
            raise ValueError(f"Import meeting/email evidence before activity: {item['ref']}")
        task_id = hive.submit_task(tenant, item["kind"], {"demo_ref": ref, "synthetic": True, "title": item["title"], "summary": item["text"]}, item["requires"], about)
        agent = item.get("agent")
        if agent:
            version = hive.claim(tenant, task_id, agent, 0)
            if version is None:
                raise RuntimeError(f"Could not claim {task_id}")
            if item.get("handoff"):
                receiver = item["handoff"]
                version = hive.handoff(tenant, task_id, agent, receiver, version, item["handoff_summary"], about)
                if version is None or hive.claim(tenant, task_id, receiver, version) is None:
                    raise RuntimeError(f"Could not hand off {task_id}")
                agent = receiver
            if item["status"] == "completed":
                hive.complete(tenant, task_id, agent, {"kind": "internal_brief", "text": item["text"]})
                if item.get("routine"):
                    if routine is None:
                        routine = hive.learn_skill(tenant, ROUTINE_GOAL, [
                            {"order": 1, "tool": "active_facts", "args_template": "{}", "guard": ""},
                            {"order": 2, "tool": "open_commitments", "args_template": "{}", "guard": "always"},
                        ], ["mtg_orbit_007", "mtg_orbit_008"], None)
                    hive.record_outcome(tenant, routine, agent, True, task_id)
            elif item["status"] == "input_required":
                hive.need_input(tenant, task_id, agent, item["question"])
        created += 1
    return {"created": created, "existing": skipped}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tenants", default="orbit")
    args = parser.parse_args()
    ctx = build_context()
    try:
        for tenant in args.tenants.split(","):
            print(json.dumps({"tenant": tenant.strip(), **import_activity(ctx, tenant.strip())}))
    finally:
        close = getattr(ctx.hive, "close", None)
        if callable(close):
            close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
