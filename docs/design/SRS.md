# Software Requirements Specification: Helium on Neo4j

Version 1.0, 12 October 2026. Team Vulcan. Companion documents: [HLD](HLD.md), [LLD](LLD.md), [architecture](architecture.md), [use cases](use-cases.md), [data schema](data-schema.md).

## 1. Introduction

### 1.1 Purpose
This document specifies the requirements of Helium, a shared, time-aware memory for teams and the agents that work for them, built on Neo4j. It is written for the people building and judging it: it states what the system must do, how well, and how each requirement is verified.

### 1.2 Scope
Helium ingests what a team says in meetings (transcripts with speakers and timestamps, or recordings transcribed through a speech-to-text service) and writes in email threads, turns the content into a graph of episodes, facts, decisions and commitments with validity intervals and provenance, answers questions with the path that produced the answer, and lets a team of agents coordinate work through the same graph. It is a hackathon build: real data, a complete vertical slice, not a production deployment (no end-user authentication on the HTTP API; see constraints).

### 1.3 Definitions
| Term | Meaning |
|---|---|
| Tenant | One team; one Neo4j database (`team-<slug>`) plus two database users |
| Episode | One utterance (meeting) or one message (email) with speaker, text, time and embedding |
| Fact | A statement `subject | predicate | object` with a validity interval; `Decision` and `Commitment` are facts with an extra label |
| Bi-temporal | A fact records when it was true (`valid_from`, `valid_to`) and when the system learned it (`created_at`, `expired_at`) |
| Supersession | A newer fact with the same key (`subject|predicate`) and a different object expires the older one and links to it with `SUPERSEDES` |
| Why path | The provenance of a fact: episode, speaker, container (meeting or thread), entities, supersession chain |
| Board | The coordination layer: agents, capabilities, tasks in A2A-shaped states, claims, hand-offs, artifacts |
| Skill | A learned procedure (ordered steps) with a success rate |
| CDC | Neo4j Change Data Capture: the per-database change log the agents' wake-ups are read from |
| GDS | Neo4j Graph Data Science plugin (PageRank, weakly connected components) |

### 1.4 References
Neo4j operations manual (databases, RBAC, CDC), Neo4j Cypher manual (vector and full-text indexes), neo4j-graphrag Python package, Graph Data Science manual, AMI Meeting Corpus (CC BY 4.0), Sarvam AI speech-to-text API, Agent2Agent (A2A) task states, Model Context Protocol (MCP).

## 2. Overall description

### 2.1 Product perspective
Helium is a three-tier system: a Next.js web app, a FastAPI service that hosts the agents, and Neo4j Enterprise as the only store. The substrate package (`hiveboard`) is the sole writer and reader of the graph; the API and the MCP server use it; the web app uses the API only. Nothing works without the graph: tenancy, recall, provenance, coordination and wake-ups all live in Neo4j.

### 2.2 Product functions
1. Ingest meetings (recorder exports or audio via Sarvam) and email threads into episodic memory.
2. Extract facts, decisions and commitments with a language model; keep them bi-temporal with supersession across sources.
3. Answer questions with evidence: router, templates, hybrid recall, free-form read-only Cypher; every answer carries the Cypher that ran, the sources and a subgraph.
4. Show what the team believed at any time; show why a fact holds (provenance and chain).
5. Company-brain analytics: who knows what, owners, open commitments, contradictions, stale decisions, entity clusters.
6. Coordinate agents: tasks, compare-and-set claims, hand-offs with subgraph references, artifacts; agents wake from the database's change log.
7. Learn and run procedures (skills) with success statistics.
8. Isolate teams: one database per tenant, RBAC per database, a demonstrable refusal.
9. Expose the memory to external agents over MCP.
10. Measure: benchmark harness, extraction evaluation against gold labels, rehearsal checker.

### 2.3 User classes
| Class | Description |
|---|---|
| Team member | Asks questions, browses sources, timeline and board, imports meetings |
| Team lead / PM | Moves commitments, reviews decision impact, runs skills |
| Agent (software) | FactAgent, FollowUpAgent, SchedulerAgent, StandupAgent, AnswerAgent |
| External agent | Cursor, VS Code or another MCP client |
| Operator | Runs Neo4j, seeds tenants, runs the bench and the checks |
| Judge | Watches the demo, reads the repository |

### 2.4 Operating environment
Windows, macOS or Linux laptop with Docker (Neo4j Enterprise evaluation image with APOC and GDS), Python 3.12 (uv), Node 20 (pnpm). Optional: Gemini API or Ollama for the model, Sarvam API for speech to text, Neo4j Aura for a mirror.

### 2.5 Constraints
- C-1 Neo4j is the primary and only database; every product feature must break without it.
- C-2 All timestamps are epoch milliseconds (int) in the graph; ISO-8601 at the API boundary.
- C-3 The product's graph queries are numbered files in `cypher/` loaded by name; the API adapter and the evidence builder keep a small set of listing and chain-edit queries inline (inventoried in the LLD); values are always parameters.
- C-4 Database names follow Neo4j's rules (letters, digits, dots, dashes), so tenant slugs `[a-z0-9_]{1,58}` map to `team-<slug with dashes>`.
- C-5 Tenancy, RBAC and CDC require Neo4j Enterprise (evaluation licence in Docker) or an Aura tier that offers them; on Community or Aura Free the system runs single-tenant with Cypher fallbacks for GDS and an in-process event bus.
- C-6 The HTTP API has no login or tenant membership check; it is meant for local and demo use with synthetic or public data.
- C-7 Data in the graph must be synthetic, public (AMI, CC BY 4.0) or the team's own.

### 2.6 Assumptions and dependencies
- Transcripts come with speaker attribution and timestamps (the recorder format), or are produced by Sarvam with diarisation.
- Embeddings are 768-dimensional (EmbeddingGemma); the same model is used for import and retrieval.
- The free tiers of the model APIs rate-limit; the demo replays reviewed labels, `--extract real` runs the model.

## 3. Specific requirements

### 3.1 Functional requirements

Ingestion
- FR-1 Import a recorder export (`version`, `meeting`, `speakers`, `segments`) and create Meeting, Person, Episode nodes with `HAS_EPISODE`, `SPOKEN_BY`, `ATTENDED` and a `NEXT` chain; consecutive same-speaker segments are merged into 30 to 60 s episodes.
- FR-2 Import an email thread (JSON, `.eml` or `.mbox`) and create EmailThread, Episode (`source_kind = email`), `SENT_BY`, `SENT_TO{cc}`, `REPLIES_TO`, `NEXT`; the tenant roster joins email addresses to people.
- FR-3 Transcribe an uploaded recording through Sarvam (Hindi, English, code-mixed), chunking WAV files longer than 30 s, and import it as FR-1; keep the recording for playback.
- FR-4 Embed every episode, fact, skill and entity (768-d) and store the vector on the node.
- FR-5 Extract facts, decisions and commitments per episode with a closed predicate vocabulary and a per-tenant subject registry; replay gold labels when configured.
- FR-6 Detect entities, link `MENTIONS` and weight `CO_MENTIONED` between entities mentioned together.

Semantic memory
- FR-7 Each fact carries `key = lower(subject|predicate)`, `valid_from` (default: the episode's time), `valid_to`, `created_at`, `expired_at`, `status` in {active, superseded, retracted}, `confidence`, `due_at` for commitments.
- FR-8 A new active fact with the same key and a different object supersedes the active one(s): `valid_to` and `expired_at` are set and `SUPERSEDES{at}` links new to old; identical restatements are confirmations (`CONFIRMED_BY`), not duplicates.
- FR-9 A fact imported later but said earlier is slotted into its chain by `valid_from` without changing the current belief.
- FR-10 `belief_at(T)` returns the facts true at valid time T, optionally as known by transaction time K; retracted facts never appear.
- FR-11 `why(fact)` returns speaker, episode, container, entities, the full supersession chain in both directions, the Cypher and a subgraph.

Answers
- FR-12 A question is routed to a template (why, who knows, owners, open commitments, contradictions, stale decisions, belief at a date), an entity-anchored graph walk, hybrid recall, or free-form read-only Cypher when the message is Cypher.
- FR-13 Hybrid recall: vector KNN over the label's index, one-hop expansion through shared entities, ranking by recency × importance × similarity, in one Cypher query.
- FR-14 Search through `neo4j-graphrag`'s hybrid retriever (vector plus full-text indexes) with provenance expansion.
- FR-15 Every answer returns the router decision, the Cypher queries that ran, the sources (with play-at offsets or email message ids) and a subgraph.
- FR-16 Free-form Cypher runs as the tenant's read-only user in a read transaction with a 3 s timeout; write clauses are rejected before execution.

Analytics
- FR-17 Who knows about an entity (people ranked by episodes spoken, sent or received), owners, open commitments (closing statements filter the rest), contradictions (same key, different active objects), stale decisions, entity clusters (WCC).
- FR-18 Decision impact: explicit work-item dependencies on baseline facts, the current fact per key with the supersession path, follow-up drafts persisted in the graph.

Coordination
- FR-19 Agents register with capabilities; tasks are submitted with `requires`, `about` and priority in state `submitted`, version 0.
- FR-20 Claim is compare-and-set: exactly one claimant wins at a given version, under the node's write lock; losers get no row.
- FR-21 Hand-off returns a task to `submitted` addressed to the receiver with a summary and the ids of the subgraph to read; complete, fail and input-required transitions are owner-only and versioned.
- FR-22 Workers wake on `task.submitted`, `task.handed_off` and (Scheduler) `fact.superseded` with a date predicate; the Scheduler re-plans and hands the follow-up to the FollowUp agent, which produces an artifact (a nudge or an issue).
- FR-23 With `HELIUM_EVENTS=cdc`, every event the workers and the SSE stream receive is derived from Neo4j Change Data Capture of the tenant database, so writes from any process (API, MCP server, seed script, Neo4j Browser) wake the agents; events carry `source`, the transaction id and the executing user.

Procedural memory
- FR-24 After two meetings with the same title prefix, the Standup agent learns a Skill with ordered Steps; skills are retrieved by goal embedding, ordered by success rate then distance; outcomes update runs and success rate; PageRank over `Task-USED->Skill` ranks skills.

Tenancy and administration
- FR-25 Creating a tenant creates its database (with transaction-log enrichment for CDC), applies the schema, creates two users bound to a reader and a writer role with grants on the tenant database and `commons` only, and registers the tenant in `commons`.
- FR-26 The reader user cannot write and cannot open any other database, including the DBMS default; the UI can demonstrate the refusal.
- FR-27 A snapshot copies the tenant database into `team-<slug>-snap-<ms>` and records a Snapshot node in `commons`.
- FR-28 Published skills are copied into `commons` with their origin tenant.

Interfaces
- FR-29 The HTTP API in `docs/contracts/http-api.md`; errors are `{error: {code, message}}`.
- FR-30 An SSE stream per tenant of `{event, payload, ts, source, tx?, user?}`.
- FR-31 An MCP server (stdio) with `recall`, `search`, `why`, `belief_at`, `list_tasks`, `claim`, `handoff`, `open_commitments`.

### 3.2 Non-functional requirements
| Id | Requirement | Target | Verified by |
|---|---|---|---|
| NFR-1 Read latency | user-facing reads (recall, active facts, task lists) | p50 under 50 ms, p99 under 300 ms with 20 agents on 4 tenants, one laptop | `bench.harness`: read p50 18 ms, p99 43 ms (4 client processes) |
| NFR-2 Throughput | mixed 80/20 load | at least 500 ops/s on one laptop | 954 ops/s |
| NFR-3 Claim safety | concurrent claims on one task | exactly one winner | 50-thread test, 25-agent demo, bench CAS race: 1 winner per tenant |
| NFR-4 Wake-up latency | fact change to agent reaction via CDC | under 2 s | rehearsals: under 1 s; `demo_check.py` |
| NFR-5 Isolation | cross-tenant read by a tenant user | refused by the server | `test_tenancy.py`, acl-probe route |
| NFR-6 Determinism | the demo corpus seeds identically every run | ids and chains stable | gold replay, `test_api_*` |
| NFR-7 Query timeouts | every user-facing read | 3 s transaction timeout | `GraphHandle.ro_query` |
| NFR-8 Observability | every answer and analytic returns its Cypher | always | Why panel, `rows.cypher` |
| NFR-9 Portability | Community / Aura Free | single-tenant mode with Cypher fallbacks | `HiveDB.capabilities()` |
| NFR-10 Maintainability | queries in `cypher/`, loaded by name; tests per layer | 47 substrate tests on live Neo4j, 191 API and ingest tests | `pytest` |
| NFR-11 Data policy | no private data in the graph | synthetic, AMI (CC BY 4.0) or the team's own | README |

### 3.3 External interface requirements
- Web app to API: JSON over HTTP, SSE for events; `NEXT_PUBLIC_API_URL`.
- API to Neo4j: Bolt (`neo4j` driver 6), managed transactions, one database per tenant, admin user for writes and schema, tenant reader user for user-facing reads.
- API to models: Gemini / OpenRouter / Ollama (chat and extraction), EmbeddingGemma over ONNX (embeddings), Sarvam (speech to text).
- MCP: stdio, JSON tool results.

## 4. Data requirements
See [data-schema.md](data-schema.md): node labels, properties and types, relationships and their properties, indexes and constraints, the file contracts (recorder export, email thread, gold labels, work manifest) and the API payload shapes.

## 5. Verification
| Requirement | Test or check |
|---|---|
| FR-1, FR-2, FR-7 to FR-11 | `packages/hiveboard/tests/test_memory.py`, `test_schema.py` |
| FR-5, FR-6 | `packages/ingest/tests/*`, `docs/eval/extraction.md` |
| FR-3 | `packages/ingest/tests/test_ingest_sarvam.py`, `apps/api/tests/test_api_transcribe.py` |
| FR-12 to FR-16 | `apps/api/tests/test_router.py`, `test_api_chat.py`, `test_answer_evidence.py`, `packages/hiveboard/tests/test_graphrag.py` |
| FR-17, FR-18 | `test_analytics.py`, `test_impact.py`, `test_api_impact.py` |
| FR-19 to FR-22 | `test_board.py`, `test_api_board.py`, `test_api_workers.py` |
| FR-23 | `test_cdc.py` (translation and live tailer), `scripts/demo_check.py` ("events carry source=cdc") |
| FR-24 | `test_skills.py`, `test_api_skills.py` |
| FR-25 to FR-28 | `test_tenancy.py`, `test_api_tenants_health.py` |
| FR-31 | `test_events_mcp_temporal.py` |
| NFR-1, NFR-2 | `docs/bench/README.md` |
