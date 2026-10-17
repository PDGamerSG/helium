# Company activity demo

`orbit.json` adds fictional internal work to the same Orbit story as the meeting and email fixtures. It contains eight tasks across submitted, working, needs-input and completed states, an agent handoff, four readable artifacts and two accepted routine runs. Every task links to imported facts. No email, Slack message or GitHub issue is sent.

Run from the repository root with the intended Neo4j connection configured:

```sh
uv run --package helium-api python data/seed.py --tenants orbit
uv run --package helium-api python data/seed_work.py --tenants orbit
uv run --package helium-api python data/seed_activity.py --tenants orbit
```

The activity importer uses `payload.demo_ref` to skip previously imported tasks. Repeating a completed import preserves task IDs, artifacts and routine outcome counts. Saved Ask conversations come from actual `/chat` requests; the recent-conversations list opens their stored answers and citations.
