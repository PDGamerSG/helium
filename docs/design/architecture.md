# Architecture

Diagrams are Mermaid and render on GitHub. Levels follow the C4 idea: context, containers, components, then the
runtime views (sequence, state, deployment).

## 1. System context

```mermaid
flowchart LR
    TM([Team member]) -->|asks, browses, imports| WEB[Helium web app]
    PM([Team lead]) -->|moves commitments, runs skills| WEB
    EXT([Cursor / VS Code]) -->|MCP tools| MCP[hiveboard MCP server]
    REC[("Recorder exports,<br/>email threads,<br/>recordings")] -->|JSON, .eml, audio| API
    WEB -->|HTTP + SSE| API[Helium API + agents]
    API --> NEO[("Neo4j Enterprise<br/>one database per team")]
    MCP --> NEO
    API -->|chat + extraction| LLM[Gemini / Ollama / OpenRouter]
    API -->|768-d vectors| EMB[EmbeddingGemma ONNX]
    API -->|speech to text| SARVAM[Sarvam AI]
    AMI[(AMI Meeting Corpus)] -->|fetch_ami.py| REC
```

## 2. Containers

```mermaid
flowchart TB
    subgraph Browser["Browser"]
        WEB["apps/web: Next.js 16<br/>tenants, sources, chat + Why panel,<br/>board, timeline, skills, bench"]
    end
    subgraph APIprocess["API process"]
        ROUTES["FastAPI routes<br/>meetings, email, memory, chat,<br/>board, skills, impact, tenants, bench, health"]
        AGENTS["Agents<br/>Fact, FollowUp, Scheduler, Standup, Answer"]
        WORKERS["Worker pool<br/>one loop per tenant x agent"]
        BUS["EventBus<br/>SSE fan-out"]
        INGEST["ingest package<br/>chunker, embedder, extractor, Sarvam"]
        HB["hiveboard package<br/>db, schema, tenancy, memory, board,<br/>skills, analytics, impact, graphrag, events, cdc"]
    end
    subgraph MCPprocess["MCP process"]
        MCPS["hiveboard.mcp_server<br/>recall, search, why, belief_at,<br/>list_tasks, claim, handoff, open_commitments"]
    end
    subgraph Neo4jEnterprise["Neo4j Enterprise"]
        SYS[(system)]
        COMMONS[("commons<br/>tenant registry, snapshots,<br/>published skills")]
        T1[(team-orbit)]
        T2[(team-nimbus)]
        T3[(team-remote)]
        CDC[["Change Data Capture<br/>per database"]]
        GDS[[GDS + APOC plugins]]
    end
    WEB -->|HTTP/SSE| ROUTES
    ROUTES --> AGENTS
    ROUTES --> INGEST
    WORKERS --> AGENTS
    AGENTS --> HB
    INGEST --> HB
    ROUTES --> HB
    BUS --> WORKERS
    BUS --> WEB
    HB -->|Bolt, managed transactions| T1 & T2 & T3 & COMMONS
    HB -->|CREATE DATABASE, users, roles| SYS
    CDC -->|db.cdc.query every 0.5 s| HB
    HB -->|events| BUS
    MCPS --> HB
    T1 -.-> CDC
```

## 3. Components of the substrate (`packages/hiveboard`)

```mermaid
flowchart LR
    DB["db.py<br/>HiveDB, GraphHandle, QueryResult<br/>one driver, per-tenant reader drivers"]
    SCH["schema.py<br/>indexes + constraints in one tx"]
    TEN["tenancy.py<br/>CREATE DATABASE, users, roles, grants,<br/>snapshot copy, registry"]
    MEM["memory.py<br/>episodes, facts, supersession,<br/>belief_at, why, recall, full-text"]
    BRD["board.py<br/>agents, tasks, CAS claim,<br/>handoff, complete, trace"]
    SK["skills.py<br/>learn, retrieve, outcome,<br/>GDS PageRank, publish"]
    AN["analytics.py<br/>who knows, owners, open commitments,<br/>contradictions, GDS WCC, stale"]
    IMP["impact.py<br/>work manifest, impacts, drafts"]
    GR["graphrag.py<br/>neo4j-graphrag HybridCypherRetriever"]
    EV["events.py<br/>in-process bus"]
    CDCM["cdc.py<br/>CdcTailer, translate_tx"]
    Q["queries.py<br/>cypher/NN_name.cypher loader"]
    MEM & BRD & SK & AN & IMP & GR --> DB
    MEM & BRD & SK & AN & IMP --> Q
    MEM & BRD & SK --> EV
    CDCM --> DB
    CDCM -->|same listeners| EV
    TEN --> SCH --> DB
```

## 4. Runtime views

### 4.1 Import a meeting

```mermaid
sequenceDiagram
    participant U as Team member
    participant W as Web
    participant A as API (jobs)
    participant I as ingest pipeline
    participant H as hiveboard
    participant N as Neo4j (team-x)
    U->>W: Import recorder JSON (or upload audio)
    W->>A: POST /tenants/x/meetings/import (or /transcribe)
    A-->>W: 202 {meeting_id, job_id}
    A->>I: run pipeline (background job)
    I->>H: remember_meeting, remember_people
    I->>I: chunk segments 30..60 s, embed
    I->>H: remember_episodes (NEXT chain, SPOKEN_BY, ATTENDED)
    I->>I: extract facts per episode (model or gold replay)
    I->>H: upsert_entities, link_mentions
    I->>H: remember_fact (supersede / confirm / slot in chain)
    H->>N: Cypher 01..12 in managed write transactions
    N-->>H: rows
    N-->>A: CDC: Episode, Fact, SUPERSEDES changes
    A-->>W: SSE episode.ingested, fact.created, fact.superseded (source: cdc)
    W->>A: GET /jobs/{id} until done
```

### 4.2 Answer a question with provenance

```mermaid
sequenceDiagram
    participant W as Web
    participant A as API / AnswerAgent
    participant H as hiveboard
    participant N as Neo4j
    participant M as Model
    W->>A: POST /chat {message}
    A->>A: router: intent, entities, route (template | graph | vector | freeform_ro)
    alt template or graph
        A->>H: template query (why, who_knows, belief_at, ...) or entity-anchored facts
    else vector
        A->>H: recall (vector KNN + 1-hop + ranking), full-text
    else freeform_ro
        A->>H: read transaction as team_x_ro, 3 s timeout
    end
    H->>N: read transaction(s)
    N-->>H: rows + the Cypher text
    A->>A: evidence: dossiers (history, source, rationale), episode recall fused by RRF
    A->>M: answer from evidence only
    M-->>A: text with citations
    A-->>W: {answer, router, cypher[], sources[], subgraph}
```

### 4.3 A commitment moves; the agents react through CDC

```mermaid
sequenceDiagram
    participant W as Web (board)
    participant A as API
    participant N as Neo4j (team-orbit)
    participant C as CdcTailer
    participant S as SchedulerAgent
    participant F as FollowUpAgent
    W->>A: POST /demo/supersede {new_object}
    A->>N: ingest_fact (tx1), supersede_fact (tx2: old.status=superseded, SUPERSEDES edge)
    C->>N: db.cdc.query(cursor)
    N-->>C: change records of tx1, tx2
    C->>C: translate_tx -> fact.created, fact.superseded, commitment.updated
    C-->>S: fact.superseded (date predicate)
    S->>N: submit_task(reschedule) + claim (CAS under node lock)
    S->>N: update commitment due_at, handoff(task -> followup_agent, subgraph_ids)
    C-->>F: task.handed_off (from CDC)
    F->>N: claim at the new version
    F->>N: complete(task, artifact: nudge / issue)
    C-->>W: SSE: every step, source: cdc, tx id
```

### 4.4 Task lifecycle (A2A states)

```mermaid
stateDiagram-v2
    [*] --> submitted: submit_task (version 0)
    submitted --> working: claim (compare-and-set on status and version, under the write lock)
    working --> submitted: handoff (owner_agent = receiver, version+1)
    working --> input_required: need_input
    input_required --> working: claim by owner
    working --> completed: complete (+ PRODUCED Artifact)
    input_required --> completed: complete
    working --> failed: fail (failure_reason)
    completed --> [*]
    failed --> [*]
```

### 4.5 Tenancy and access

```mermaid
flowchart LR
    ADMIN["neo4j admin<br/>(API, seed, schema)"] -->|all| ORBIT[(team-orbit)]
    ADMIN -->|all| NIMBUS[(team-nimbus)]
    ADMIN -->|all| COMMONS[(commons)]
    RO["team_orbit_ro<br/>role team_orbit_reader"] -->|ACCESS + MATCH| ORBIT
    RO -->|ACCESS + MATCH| COMMONS
    RO -.->|refused: ACCESS not allowed| NIMBUS
    RW["team_orbit_rw<br/>role team_orbit_writer"] -->|+ WRITE, NAME MANAGEMENT| ORBIT
    RW -->|+ WRITE| COMMONS
    RW -.->|refused| NIMBUS
```

## 5. Deployment

```mermaid
flowchart TB
    subgraph Laptopdemo["Laptop (demo)"]
        D["Docker Desktop<br/>neo4j:enterprise eval + APOC + GDS<br/>7474 Browser, 7687 Bolt"]
        P["uv: FastAPI on 8081<br/>15 agent workers, 4 CDC tailers"]
        N2["pnpm: Next.js dev on 3002"]
        O["Ollama or Gemini API<br/>EmbeddingGemma ONNX on CPU"]
        CL["Cursor or VS Code<br/>MCP client"]
    end
    subgraph Optionalcloud["Optional cloud"]
        AURA[("Neo4j Aura Free<br/>mirror of one tenant")]
        SV["Sarvam AI<br/>speech to text"]
        GH["GitHub<br/>follow-up issues"]
    end
    N2 --> P --> D
    CL --> D
    P --> O
    P --> SV
    P --> GH
    D -.->|scripts/mirror_tenant.py| AURA
```

Container images: `apps/api/Dockerfile` (python 3.12-slim + uv; port 8000) and `apps/web/Dockerfile`; `docker-compose.yml`
wires `neo4j`, `api` and `web`.

## 6. Design decisions

| Decision | Why | Alternative considered |
|---|---|---|
| One Neo4j database per tenant | the server enforces isolation (RBAC per database), writes never contend across teams, a tenant can be copied or dropped as a unit | a `tenant` property on every node (checked in code, not by the database) |
| Bi-temporal facts with `SUPERSEDES` | "what did we believe on the 10th" and "what changed and why" are first-class queries | overwrite in place (loses history), event sourcing only (no current view) |
| Compare-and-set under the node's write lock | Neo4j locks at the first SET; the version check must run after the lock | `apoc.lock.nodes`, a global lock node, optimistic retry in Python |
| Wake-ups from Change Data Capture | any writer wakes the agents, with a transaction id to trace; no application message bus | in-process bus only (misses MCP and Browser writes), Kafka |
| Ranking inline in Cypher | one round trip per recall; no custom functions to deploy | a user-defined function, ranking in Python |
| Queries as files loaded by name | reviewable, testable, shown verbatim in the Why panel | ORM, query builders |
| GDS projected and dropped inside one query | no projection state to manage between calls; Cypher fallbacks keep Aura Free working | persistent projections, APOC path expansion |
| neo4j-graphrag retriever next to our own recall | the ecosystem's retriever over the same indexes, with our provenance expansion | one retrieval path only |
