# Helium Rebrand and Repository Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a distinct, fully branded Helium repository from the working Neo4j implementation while preserving its tested product behavior.

**Architecture:** Preserve the existing package boundaries around Neo4j/Cypher, ingestion, FastAPI, agents, and Next.js, but introduce them in small, reviewable commits. Apply Helium identity across public metadata, runtime configuration, documentation, and web presentation, then run focused and full verification.

**Tech Stack:** Python 3.12, UV workspaces, Neo4j Enterprise, FastAPI, pytest, Ruff, Next.js, React, TypeScript, pnpm, Tailwind/CSS, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-10-16-helium-rebrand-design.md`

## Global Constraints

- Product name: `Helium`.
- Preserve MIT licensing and concise upstream attribution.
- Keep Neo4j as the system of record and preserve tenant/provenance semantics.
- Use imperative commit subjects modeled on `On-Record`.
- Set commit metadata gaps between 25 and 55 minutes.
- Do not commit secrets, generated virtual environments, or `node_modules`.

---

### Task 1: Establish the Helium workspace foundation

**Files:**
- Create: `.gitignore`, `.gitattributes`, `LICENSE`, `README.md`, `docs/UPSTREAM.md`, `brand.json`
- Modify: `docs/superpowers/specs/2026-10-16-helium-rebrand-design.md`, `docs/superpowers/plans/2026-10-16-helium-rebrand.md`

- [ ] Write the baseline metadata and README with Helium product language and setup direction.
- [ ] Verify no public baseline file uses the `Minutes` product name except attribution text.
- [ ] Commit as `chore: establish Helium workspace foundation`.

### Task 2: Define Helium runtime configuration

**Files:**
- Create: `.env.example`, `docker-compose.yml`, `pyproject.toml`, `uv.lock`
- Modify: `README.md`

- [ ] Define Helium service names, ports, Neo4j defaults, UV workspace members, and test settings.
- [ ] Run `uv lock` and validate the root TOML with `uv run python -c 'import tomllib; tomllib.load(open("pyproject.toml", "rb"))'`.
- [ ] Commit as `chore: define Helium runtime configuration`.

### Task 3: Add the graph schema and query catalog

**Files:**
- Create: `cypher/00_schema.cypher` through the numbered schema/query files and `packages/hiveboard/hiveboard/queries.py`
- Create: `packages/hiveboard/pyproject.toml`, `packages/hiveboard/hiveboard/__init__.py`

- [ ] Copy the query catalogue and make query loading resolve from the package root.
- [ ] Add a test that loads representative schema, memory, and coordination queries.
- [ ] Run the focused schema/query test and commit as `feat: add Helium graph schema and query catalog`.

### Task 4: Add tenant-aware Neo4j access

**Files:**
- Create: `packages/hiveboard/hiveboard/db.py`, `schema.py`, `tenancy.py`, `errors.py`, `ids.py`, `records.py`, `temporal.py`
- Test: `packages/hiveboard/tests/test_schema.py`, `test_tenancy.py`

- [ ] Implement driver lifecycle, tenant validation, database naming, RBAC helpers, and record conversion.
- [ ] Run `uv run pytest packages/hiveboard/tests/test_schema.py packages/hiveboard/tests/test_tenancy.py -q`.
- [ ] Commit as `feat: add tenant-aware Neo4j access`.

### Task 5: Add Helium provenance memory

**Files:**
- Create: `packages/hiveboard/hiveboard/memory.py`, `analytics.py`
- Test: `packages/hiveboard/tests/test_memory.py`, `test_analytics.py`

- [ ] Add temporal fact, episode, entity, supersession, evidence, and retrieval service methods.
- [ ] Run the two focused tests and commit as `feat: add Helium provenance memory`.

### Task 6: Add Helium work coordination

**Files:**
- Create: `packages/hiveboard/hiveboard/board.py`, `impact.py`
- Test: `packages/hiveboard/tests/test_board.py`, `test_impact.py`

- [ ] Add task claiming, handoffs, artifacts, impact drafts, and compare-and-set version handling.
- [ ] Run focused board and impact tests and commit as `feat: add Helium work coordination`.

### Task 7: Add Helium skill learning

**Files:**
- Create: `packages/hiveboard/hiveboard/skills.py`
- Test: `packages/hiveboard/tests/test_skills.py`

- [ ] Add skill retrieval, outcomes, learning, publication, deprecation, and analytics calls.
- [ ] Run the skill tests and commit as `feat: add Helium skill learning`.

### Task 8: Add event and CDC services

**Files:**
- Create: `packages/hiveboard/hiveboard/events.py`, `cdc.py`
- Test: `packages/hiveboard/tests/test_cdc.py`, `test_events_mcp_temporal.py`

- [ ] Add event contracts, in-process fallback, CDC transaction grouping, and wake-up filtering.
- [ ] Run focused event/CDC tests and commit as `feat: add Helium event and CDC pipeline`.

### Task 9: Add GraphRAG and MCP interfaces

**Files:**
- Create: `packages/hiveboard/hiveboard/graphrag.py`, `mcp_server.py`, `bench/`
- Test: `packages/hiveboard/tests/test_graphrag.py`, `test_events_mcp_temporal.py`

- [ ] Add provenance-aware hybrid retrieval, MCP tools, and benchmark harness entry points.
- [ ] Run focused GraphRAG/MCP tests and commit as `feat: add Helium GraphRAG and MCP interfaces`.

### Task 10: Add meeting and email contracts

**Files:**
- Create: `packages/ingest/pyproject.toml`, `packages/ingest/ingest/__init__.py`, `recorder_format.py`, `email_format.py`, `models.py`, `dates.py`, `vocab.py`
- Test: `packages/ingest/tests/test_ingest_format.py`, `test_ingest_email.py`, `test_ingest_models.py`, `test_ingest_vocab.py`

- [ ] Add validated recorder/email boundaries and canonical ingestion models.
- [ ] Run focused contract tests and commit as `feat: add meeting and email ingestion contracts`.

### Task 11: Add transcript processing

**Files:**
- Create: `packages/ingest/ingest/chunker.py`, `embed.py`, `llm_protocol.py`, `llm_client.py`, `fakes.py`
- Test: `packages/ingest/tests/test_ingest_chunker.py`, `test_ingest_embed.py`

- [ ] Add deterministic chunking, embedding adapters, protocol types, and test fakes.
- [ ] Run focused transcript tests and commit as `feat: add Helium transcript processing`.

### Task 12: Add extraction and evaluation

**Files:**
- Create: `packages/ingest/ingest/extract.py`, `eval.py`, `gold.py`, `pipeline.py`, `sarvam.py`
- Test: remaining `packages/ingest/tests/`

- [ ] Add extraction, scoring, gold-label comparison, pipeline orchestration, and optional Sarvam integration.
- [ ] Run `uv run pytest packages/ingest/tests -q` and commit as `feat: add Helium extraction and evaluation pipeline`.

### Task 13: Add corpus and seed tooling

**Files:**
- Create: `data/`, `scripts/`, `docs/eval/`, `data/ami/README.md`
- Modify: `README.md`

- [ ] Add synthetic fixtures, seed/reset entry points, AMI conversion helpers, and evaluation artifacts.
- [ ] Run the seed help/dry-run command and commit as `feat: add AMI corpus and seed tooling`.

### Task 14: Establish the API foundation

**Files:**
- Create: `apps/api/pyproject.toml`, `Dockerfile`, `main.py`, `config.py`, `errors.py`, `state.py`, `hive_adapter.py`, `bus.py`
- Test: `apps/api/tests/conftest.py`, `test_startup.py`, `test_api_tenants_health.py`

- [ ] Add FastAPI application wiring, dependency state, error mapping, and health endpoints.
- [ ] Run focused startup/health tests and commit as `feat: establish Helium API foundation`.

### Task 15: Expose memory and coordination routes

**Files:**
- Create: `apps/api/routes/health.py`, `tenants.py`, `meetings.py`, `memory.py`, `chat.py`, `board.py`, `impact.py`, `skills.py`, `email.py`, `bench.py`
- Test: corresponding `apps/api/tests/test_api_*.py`

- [ ] Add tenant, meeting, memory, chat, board, impact, skills, email, and benchmark endpoints with Helium response copy.
- [ ] Run all route tests and commit as `feat: expose Helium memory and coordination routes`.

### Task 16: Add Helium agent workers

**Files:**
- Create: `apps/api/agents/`, `jobs.py`, `workers.py`, `impact_service.py`, `ingest_service.py`, `llm/`
- Test: `apps/api/tests/test_router.py`, `test_answer_evidence.py`, `test_api_workers.py`, `test_jobs.py`, `test_llm_loop.py`

- [ ] Add router, answer, fact, standup, scheduler, and follow-up agents with prompts and fake policies.
- [ ] Run focused worker tests and commit as `feat: add Helium agent workers`.

### Task 17: Create the Helium web shell

**Files:**
- Create: `apps/web/package.json`, `pnpm-workspace.yaml`, `next.config.ts`, `tsconfig.json`, `app/layout.tsx`, `app/globals.css`, `components/AppShell.tsx`, `components/Page.tsx`, `lib/`
- Modify: `.env.example`, `README.md`

- [ ] Add Helium typography, color tokens, navigation, responsive shell, API client, and product metadata.
- [ ] Run `pnpm install`, `pnpm typecheck`, and `pnpm lint` from `apps/web`.
- [ ] Commit as `feat: create Helium web shell and navigation`.

### Task 18: Add memory exploration surfaces

**Files:**
- Create: `apps/web/components/pages/TimelinePage.tsx`, `ChatPage.tsx`, `SourcesPage.tsx`, `CompanyOverview.tsx`, `GraphView.tsx`, `WhyPanel.tsx`, `archive/`, `memory/`, `landing/`
- Modify: `apps/web/app/page.tsx`, route styles

- [ ] Build the distinct Helium landing, timeline, graph, chat, sources, provenance, archive, and memory views.
- [ ] Run web typecheck/lint and commit as `feat: add Helium memory exploration surfaces`.

### Task 19: Add operations surfaces

**Files:**
- Create: `apps/web/components/pages/BoardPage.tsx`, `TenantsPage.tsx`, `SkillsPage.tsx`, `BenchPage.tsx`, `CommandMenu.tsx`, `workspace/`, UI primitives
- Modify: `apps/web/app/workspaces/page.tsx`, styles

- [ ] Add board, tenants, skills, bench, workspaces, command menu, dialogs, tables, and status components with Helium terminology.
- [ ] Run web typecheck/lint and commit as `feat: add Helium operations surfaces`.

### Task 20: Add regression and integration coverage

**Files:**
- Modify: all package/API test fixtures as needed
- Create: `.github/workflows/checks.yml`, `scripts/check-helium-brand.py`

- [ ] Add CI for Python tests, Ruff, web checks, and the stale-name scan.
- [ ] Run the complete Python suite, Ruff, web checks, and brand scan; commit as `test: add Helium regression and integration coverage`.

### Task 21: Document architecture and demo workflow

**Files:**
- Create: `docs/design/`, `docs/contracts/`, `docs/neo4j-browser-queries.md`, `docs/helium-demo.md`, `infra/README.md`
- Modify: `README.md`, package READMEs, `.env.example`

- [ ] Rewrite setup, architecture, contracts, demo, and operational docs in Helium voice.
- [ ] Run the final verification checklist, stale-name scan, `git diff --check`, and clean-tree check.
- [ ] Commit as `docs: document Helium architecture and demo workflow`.
