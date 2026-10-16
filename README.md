# Helium

**A time-aware memory workspace for teams and their agents.**

Helium turns meetings, email, and agent work into a searchable Neo4j graph. Every answer keeps its evidence: who said it, when it was true, which source produced it, and what later decision replaced it.

## What Helium provides

- Temporal facts with supersession and provenance paths.
- One Neo4j database per tenant with database-level access control.
- Change Data Capture events that wake coordination workers.
- Hybrid graph and vector retrieval through the API and MCP.
- A workspace UI for memory, decisions, commitments, skills, and impact.

## Repository shape

```text
cypher/              numbered graph queries and schema
packages/hiveboard/  Neo4j substrate, memory, coordination, CDC, MCP
packages/ingest/     recorder/email contracts, extraction, embeddings
aapps/api/           FastAPI routes, agents, and workers
apps/web/            Next.js workspace UI
data/                synthetic and evaluation fixtures
docs/                architecture, contracts, and demo runbooks
```

## Quick start

```bash
cp .env.example .env
docker compose up -d neo4j
uv sync --all-packages
uv run --package helium-api pytest
```

The full local setup and the Helium demo path are documented in [`docs/helium-demo.md`](docs/helium-demo.md).

## Attribution

Helium is an independent implementation assembled from the working Neo4j prototype in `minutes-neo4j`. See [`docs/UPSTREAM.md`](docs/UPSTREAM.md) for the focused attribution record.
