# Helium demo runbook

This is the shortest path from a fresh checkout to the Helium workspace.

## Start the graph

```bash
cp .env.example .env
docker compose up -d neo4j
uv sync --all-packages
```

Neo4j Enterprise provides the tenant databases, RBAC grants, and Change Data Capture used by the demo. A local fake context is available to API tests and does not require Neo4j.

## Seed and run the API

```bash
uv run --package helium-api python data/seed.py --tenants orbit,nimbus,quill --reset
uv run --package helium-api uvicorn apps.api.main:app --port 8081
```

The API exposes `/health`, `/tenants`, `/tenants/{tenant}/memory`, `/tenants/{tenant}/chat`, and the coordination routes under `/tenants/{tenant}/tasks`.

## Run the workspace

```bash
cd apps/site
pnpm install
pnpm dev
```

Open <http://localhost:3003>. The landing view is the Helium entry point; `/workspace` opens the team directory. Set `HELIUM_SOURCE=sample` for a read-only preview when the API is not running.

## What to show

1. Open a tenant and ask when a commitment is due.
2. Open the evidence panel to see the speaker, source episode, and supersession chain.
3. Move a commitment from Crew and watch Tempo's events on the task board.
4. Open Memory to compare what the team knew at two timestamps.
5. Use Crew to inspect learned routines and Changes to review affected work.
