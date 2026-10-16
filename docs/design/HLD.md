# High-level design

Helium is a memory graph for teams and their agents on Neo4j, with a FastAPI service that hosts the agents and a
Next.js front end. This document describes the layers, the data flow, the Neo4j usage, the event model, security,
scaling and the choices behind them. Diagrams are in [architecture.md](architecture.md); the schema is in
[data-schema.md](data-schema.md); module-level detail is in [LLD.md](LLD.md).

## 1. Layers

| Layer | Package | Responsibility | Talks to |
|---|---|---|---|
| Presentation | `apps/web` (Next.js 16, React 19) | workspace directory, company overview with decision impact (`/t/[team]`), sources, chat with the Why panel, board with the live event stream, timeline with belief-at-T, skills, bench | the API over HTTP and SSE |
| Application | `apps/api` (FastAPI) | routes, background jobs, the five agents and their tools, the worker pool, the SSE bus | `hiveboard`, `ingest`, model APIs, Sarvam |
| Ingestion | `packages/ingest` | recorder and email parsing, chunking, embeddings (EmbeddingGemma over ONNX), extraction prompts and controlled vocabulary, Sarvam client, evaluation | `hiveboard` through the hive adapter |
| Substrate | `packages/hiveboard` | the graph layer: connection, schema, tenancy, memory, board, skills, analytics, impact, retrieval, events, CDC, MCP; the numbered queries in `cypher/` | Neo4j (Bolt), GDS, APOC |
| Store | Neo4j Enterprise | one database per tenant plus `commons` and `system`; indexes; RBAC; CDC; GDS | |

The hive adapter (`apps/api/hive_adapter.py`) is the seam between the application and the substrate: `RealHive` delegates to `hiveboard` and keeps a small set of its own inline Cypher for listings and chain edits (meeting and thread listings, facts by key, counts, `insert_fact_in_chain`, `confirm_fact`, `update_fact_due`, chat turns, `touch_agent`, the `PRECEDENT_FOR` link); the answer agent's evidence builder (`apps/api/agents/evidence.py`) has four read queries of its own. `FakeHive` is a complete in-memory implementation for tests and model-free runs. The two expose the same methods, so the API suite runs without a database. The full inventory, including the Cypher outside `cypher/`, is in [LLD.md](LLD.md).

## 2. Data flow

1. **Sources to episodes.** A recorder export (or a recording transcribed by Sarvam) or an email thread is parsed, validated against its contract, chunked into 30 to 60 s same-speaker episodes, embedded, and written with its provenance edges and a `NEXT` chain.
2. **Episodes to facts.** Per episode the extractor proposes `(kind, subject, predicate, object)` items against a closed predicate set and the tenant's subject registry; the pipeline resolves each item against the active facts with the same key: identical object → confirmation, different object → supersession (judged by hints or the model), earlier `valid_from` than the head → slotted into the chain.
3. **Facts to answers.** The router picks a template, a graph walk or recall; the evidence builder assembles every version of each fact with speaker and source, fuses episode recall by reciprocal rank, and the model answers from that evidence; the response carries the Cypher and a subgraph.
4. **Facts to actions.** A supersession with a date predicate wakes the Scheduler through CDC; tasks move through the board with compare-and-set claims and hand-offs; artifacts record what agents produced.
5. **Experience to procedure.** Two meetings with the same shape teach the Standup agent a Skill; outcomes update its success rate; PageRank ranks skills by use.

## 3. How Neo4j is used

| Need | Neo4j feature | Where |
|---|---|---|
| Isolation per team | one database per tenant, `CREATE DATABASE ... OPTIONS {txLogEnrichment: 'FULL'}` | `tenancy.py`, `db.py` |
| Least privilege | users and roles per tenant: ACCESS + MATCH for readers, WRITE + NAME MANAGEMENT for writers, home database set to the tenant | `tenancy.py` |
| Semantic recall | vector indexes (HNSW, cosine, 768-d) on Episode, Fact, Skill, Entity; `db.index.vector.queryNodes` | `30_recall_hybrid`, `40_skill_retrieve` |
| Keyword recall | full-text (Lucene) indexes on Episode, Fact, Decision text | `15_fulltext`, graphrag |
| Ecosystem retriever | `neo4j-graphrag` `HybridCypherRetriever` over the same indexes | `graphrag.py`, `/search`, MCP `search` |
| Ranking | inline Cypher: recency × importance × similarity | `30_recall_hybrid` |
| Provenance | variable-length `SUPERSEDES*1..10` chains, map projections without embeddings | `32_why_path` |
| Time travel | range indexes on `valid_from`, `valid_to`, `status` | `31_belief_at_time` |
| Coordination | write locks: `SET t._lock` before the version check | `20_claim_task`, `21_handoff_task` |
| Wake-ups | Change Data Capture: `db.cdc.current`, `db.cdc.query` with selectors, FULL enrichment | `cdc.py` |
| Graph algorithms | GDS PageRank over Task-USED-Skill, WCC over co-mentioned entities, projected and dropped inside the query | `60_`, `61_` (fallbacks `62_`, `63_`) |
| Snapshots | database copy with dynamic labels and types (`SET n:$(labels)`, `[:$(type)]`) | `tenancy.copy_database` |
| Counts | `apoc.meta.stats` | `db.usage` |
| Introspection | `SHOW DATABASES`, `SHOW INDEXES`, `SHOW CONSTRAINTS`, `SHOW ROLE ... PRIVILEGES AS COMMANDS`, `dbms.components`, `SHOW PROCEDURES` | `db.capabilities`, `acl_rules` |

## 4. Event model

Two sources feed the same listeners (`HiveDB.add_listener`):

- `hiveboard.events.publish` (writer-side, in-process): the function that just wrote publishes the full payload. Default when CDC is unavailable.
- `hiveboard.cdc.CdcTailer` (change-log side): one thread per tenant polls `db.cdc.query` every 0.5 s, groups records by transaction, and `translate_tx` turns node and relationship changes into the same event names and payloads (Fact create → `fact.created`; SUPERSEDES create → `fact.superseded` with the old object from the before-state; Task status transitions → `task.claimed` / `task.handed_off` / `task.completed` / `task.failed` / `task.input_required`; HAS_EPISODE creates → `episode.ingested`; Skill create and RAN → `skill.learned` / `skill.ran`). When the tailer runs, writer-side publish only records for replay, so nothing is delivered twice.

Consumers: the worker loops (wake on `task.submitted`, `task.handed_off`, Scheduler on `fact.superseded`), the SSE route (one queue per client, replay of the last N), the board page.

## 5. Agents

| Agent | Capability | Reacts to | Tools |
|---|---|---|---|
| FactAgent | extract | `extract_episode`, `record_fact` tasks | recall, active_facts, write_fact |
| SchedulerAgent | schedule | `fact.superseded` with a date predicate, delivered by the event bus (fed by CDC when `HELIUM_EVENTS=cdc`, by the writer otherwise) | why, active_facts, open_commitments, update_commitment, submit_task, hand_off |
| FollowUpAgent | followup | `followup`, `nudge`, `reschedule` after hand-off | recall, why, open_commitments, active_facts, create_issue |
| StandupAgent | standup | `learn_standup` after imports, `run_skill` | open_commitments, active_facts, stale_decisions, recall, retrieve_skill, learn_skill |
| AnswerAgent | answer | `POST /chat`, `question` tasks | router, templates, recall, graph walk, read-only Cypher |

Agents never write raw Cypher: tools call `hiveboard` functions with parameters. Free-form Cypher from users runs as the tenant's reader in a read transaction with a 3 s timeout.

## 6. Security and tenancy

- The API connects as the admin user for writes and schema; user-facing reads go through the tenant's reader user when its password is configured (read transactions, writes refused by the server).
- Each tenant's reader and writer roles are granted only on that tenant's database and `commons`; the users' home database is the tenant, so the DBMS default database is unreachable. The acl-probe route demonstrates the refusal.
- Free-form Cypher is screened for write clauses before it reaches the reader transaction.
- Known gap: the HTTP API has no login or tenant membership check (see SRS C-6).

## 7. Performance and scaling

- Every user-facing read is one Cypher query with a transaction timeout; embeddings are never returned to clients (map projections).
- Schema is applied in one transaction (41 statements), so a tenant is created in a few seconds.
- Measured on one laptop: 954 ops/s at read p50 18 ms with 20 agents on 4 tenants and 4 client processes; one Python process is the limit at about 230 ops/s (the GIL), not the server.
- Horizontal: tenants are independent databases; the API process can be sharded by tenant; CDC tailers are per database.

## 8. Portability

`HiveDB.capabilities()` probes edition, GDS, APOC and CDC once. On Community or Aura Free: single database, GDS queries fall back to `62_`/`63_`, events fall back to the in-process bus, tenancy and RBAC are not available. `scripts/mirror_tenant.py` copies one tenant into such an instance.

## 9. Testing strategy

- Substrate: 47 tests against a live Neo4j Enterprise, each in a fresh tenant database dropped at teardown (schema, tenancy and RBAC, memory and supersession, board and the 50-thread claim race, skills with GDS, analytics, impact, CDC translation and live tailer, GraphRAG, MCP tools).
- Application and ingestion: 191 tests on the in-memory hive and fake model (routes, agents, workers, router, evidence, pipeline, formats, Sarvam, vocabulary, evaluation).
- Front end: TypeScript typecheck and lint.
- Rehearsal: `scripts/demo_check.py` drives every demo beat against the live stack.
