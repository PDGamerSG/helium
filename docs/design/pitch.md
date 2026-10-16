# Pitch: Helium, the memory a team and its agents share

The 3-minute stage script and the judges' Q&A are in [docs/pitch-neo4j.md](../pitch-neo4j.md). This document is the
positioning: what we are selling, why it is different, what it is worth, and exactly how Neo4j makes it possible.
It is written to be lifted into the deck slide by slide (outline at the end).

## 1. One sentence

Helium turns what a team says in meetings and writes in email into a Neo4j graph that knows what is true now, what
was true before, who said it and why, and lets the team's agents coordinate through that same graph.

## 2. The problem we solve

Teams forget three things, and their agents inherit the amnesia.

| What gets lost | What it costs | What exists today |
|---|---|---|
| **What we decided.** The UPI flow had three due dates across a kickoff, a standup and an email thread. | people act on the stale one; the PM re-explains it in every meeting | transcripts and summaries: they contain all three dates and cannot tell you which is current |
| **When it stopped being true.** "What did we believe on the 10th, when the customer signed off?" | post-mortems guess; compliance cannot reconstruct the state of knowledge at a date | wikis overwrite; chat scrolls away; RAG retrieves the top-k nearest sentences without time |
| **Why, and who to ask.** A decision with no speaker, no utterance, no chain back to the constraint that forced it | nobody trusts the answer, so nobody uses the tool | meeting bots give a paragraph with no provenance you can play back |
| **Agents racing each other.** Two assistants pick up the same follow-up; one acts on last week's date | duplicate nudges, wrong tickets, agents that cannot hand work to each other with context | agent frameworks keep memory per agent, per conversation, in a vector store |

The audience is any team that runs on meetings and threads and is adding agents to its work: product teams, delivery
teams, consultancies. The buyer is the person who is tired of being the team's memory.

## 3. What Helium does (the five things the demo shows)

1. **Ingest real conversation.** Recorder exports, email threads, or audio transcribed by Sarvam (Hindi, English and code-mixed), chunked into 30 to 60 second episodes with speaker, time and embedding.
2. **Keep facts bi-temporal.** Every fact, decision and commitment has valid time (when it was true) and transaction time (when we learned it). A newer statement supersedes the older one and links to it; a restatement confirms it; a late import slots into the chain without changing the current belief.
3. **Answer with the receipt.** Every answer carries the Cypher that ran, the sources (play the utterance at the timestamp, open the email) and the subgraph. The timeline shows the team's belief at any date.
4. **Let agents coordinate in the graph.** Tasks in A2A states, compare-and-set claims under the node's write lock, hand-offs that carry a pointer into the graph, artifacts. Agents wake from Neo4j's change log, so a fact changed by anyone (the UI, an MCP client, Neo4j Browser) triggers the right agent.
5. **Learn routines.** Two standups with the same shape teach the Standup agent a skill with steps and a success rate; GDS PageRank ranks the skills the team uses.

Real data: the AMI Meeting Corpus (four recorded design meetings from 2004, CC BY 4.0) with real audio, next to three synthetic teams. Ask "What did they decide about the battery?" and hear the three answers in order.

## 4. How we differ

| | Meeting bots (Otter, Fireflies, Gemini notes) | RAG over transcripts | Agent memory libraries (Mem0, Zep, Neo4j Agent Memory) | **Helium** |
|---|---|---|---|---|
| Unit of memory | a summary per meeting | a chunk | a fact per agent or per user | a fact per **team**, shared by people and agents |
| Time | none | none | some keep validity intervals | **bi-temporal** (valid time and transaction time), supersession chains across meetings and email |
| Provenance | link to the recording | the chunk | the message | speaker, utterance with play-at offset or the email, the Cypher, the subgraph |
| "What did we believe on the 10th?" | no | no | partially | yes, one query over range indexes |
| Agents coordinating | no | no | no | tasks, CAS claims, hand-offs, artifacts in the same graph |
| Reactive agents | no | no | no | wake-ups from **Neo4j Change Data Capture**, with the transaction id |
| Tenancy | SaaS account | application code | application code | **one Neo4j database per team, RBAC enforced by the server**; a demonstrable refusal |
| Procedures | no | no | no | skills learned from repeated meetings, success rates, PageRank |
| Languages | English first | depends | depends | Hindi, English and Hinglish through Sarvam |
| Can you check the answer? | listen to the recording | read the chunk | read the memory | play the utterance; read the Cypher |

Said simply: a meeting bot remembers a meeting, an agent memory remembers an agent, Helium remembers a team, with time
in it, and the agents work inside that memory instead of beside it.

## 5. The value, stated plainly

- **For a team member**: one place to ask "what is current, since when, and who said it" and get an answer you can play back. No re-reading three threads.
- **For a team lead**: a changed decision shows what work it touches (decision impact), and the follow-up is drafted by an agent that read the chain, not the last message.
- **For an organisation**: compliance-grade reconstruction of what was known at a date; least-privilege tenancy the database enforces; every answer auditable down to the query.
- **For agents**: shared, consistent memory with exactly-one-winner task claims and hand-offs that carry context, so adding a second agent reduces work instead of doubling it.

Measured, on one laptop:

| What | Result |
|---|---|
| Mixed read/write load, 20 agents, 4 tenants | 954 operations per second |
| User-facing read latency | p50 18 ms, p99 43 ms |
| Concurrent claims on one task (50 threads, and 25 agents on stage) | exactly one winner every run |
| Fact change to agent reaction through CDC | under one second |
| Extraction against gold labels, scripted corpus, strict match | precision 0.42, recall 0.59 (Gemma 4 26B) |
| Extraction on the real AMI meetings, strict match | precision and recall 0.02; subject recall 0.55. The demo replays reviewed labels, every fact plays its utterance |
| Tests | 47 on live Neo4j Enterprise, 191 on the API and ingestion, web typecheck and lint |

## 6. How we use Neo4j (and what would break without it)

| Neo4j feature | What it does in Helium | Without it |
|---|---|---|
| Multi-database, `CREATE DATABASE ... OPTIONS {txLogEnrichment:'FULL'}` | one database per team, created in seconds with the schema in one transaction | tenancy becomes a property check in application code |
| RBAC: users, roles, `GRANT ACCESS / MATCH / WRITE ... ON DATABASE`, `SET HOME DATABASE` | reader and writer per team; the reader of one team is refused by the server on another team's database | the UI's "probe isolation" button has nothing to show |
| Change Data Capture: `db.cdc.current`, `db.cdc.query` with selectors | agents wake from committed changes with the transaction id and user; a write from any client triggers them | an application message bus that misses writes from MCP clients and Neo4j Browser |
| Write locks on `SET` | the compare-and-set claim: bump a lock property, then check status and version under the lock | double claims, or an external lock service |
| Vector indexes (HNSW, cosine, 768-d) on Episode, Fact, Skill, Entity | semantic recall and skill retrieval, inline with one-hop expansion and ranking in one Cypher query | a separate vector store and a join in Python |
| Full-text (Lucene) indexes | keyword recall; the second leg of the hybrid retriever | |
| `neo4j-graphrag` `HybridCypherRetriever` | the ecosystem's retriever over our indexes with our provenance expansion | |
| Variable-length paths `SUPERSEDES*1..10` | the "why" chain in both directions, precedents and confirmations | recursive queries in application code |
| Range indexes on `valid_from`, `valid_to`, `status`, `key` | belief at time T, as known by K, in milliseconds | |
| GDS PageRank and WCC (projected and dropped inside the query) | ranked skills; entity clusters for "what belongs together" | Cypher fallbacks exist (slower, no scores) |
| Database copy with dynamic labels `SET n:$(labels)` | tenant snapshots registered in `commons` | |
| APOC `apoc.meta.stats`, `SHOW` commands | counts, capabilities, grants shown in the UI | |

The substrate was first built on another graph database; this week it was rebuilt on Neo4j and the features above are
the ones that only became possible here. Every product feature breaks when Neo4j is removed, and the Why panel shows
the Cypher for every answer, so the judges can read what ran.

## 7. Why this wins a graph hackathon

- **The graph is the product, not a cache.** Time, provenance, tenancy and coordination are all graph structure; the demo is five Cypher queries the audience can read.
- **Real data, real audio, real voice input.** AMI meetings from 2004 and a Hinglish recording through Sarvam, not a toy dataset.
- **Agents that react to the database.** CDC-driven wake-ups are rare in demos and easy to show: change a fact in Neo4j Browser and watch the board move.
- **Everything is verifiable on stage.** The isolation probe, the 25-agent claim, the chain with a play button, the belief-at-date scrubber.
- **Engineering depth the judges can inspect.** SRS, high-level and low-level design, schema with types, 52 reviewed Cypher files, benchmarks and tests in the repository.

## 8. What comes next (say this when asked about the roadmap)

- Login and tenant membership on the API (the one known gap).
- Live ingestion from a meeting recorder and a mailbox instead of exports.
- Rules per team: which predicate changes wake which agent.
- Aura deployment of a tenant (the mirror script exists) and Neo4j Agent Memory interoperability.

## 9. Deck outline (12 slides, 3 helium plus questions)

| # | Slide | Content | Source |
|---|---|---|---|
| 1 | Helium | one sentence, team, the three questions a team cannot answer | section 1 |
| 2 | The problem | the four losses table, one example (three UPI dates) | section 2 |
| 3 | What it is | five capabilities, one screenshot of the Why panel | section 3 |
| 4 | Architecture | context and container diagrams | [architecture.md](architecture.md) sections 1 and 2 |
| 5 | Data model | the entity-relationship diagram, bi-temporal chart | [data-schema.md](data-schema.md) |
| 6 | Demo 1: the chain | "When is the UPI flow due?" with the play button | [demo-script.md](../demo-script.md) |
| 7 | Demo 2: time travel | the timeline on 10 September | |
| 8 | Demo 3: agents react | "Move it to Friday"; CDC sequence diagram | [architecture.md](architecture.md) section 4.3 |
| 9 | Demo 4: real meetings | AMI battery chain with audio, Hinglish through Sarvam | [data/ami/README.md](../../data/ami/README.md) |
| 10 | How we use Neo4j | the feature table | section 6 |
| 11 | Differentiation and value | the comparison table and the measured numbers | sections 4 and 5 |
| 12 | Built this week, what is next | timeline, gap, roadmap, repository links (SRS, HLD, LLD, use cases, schema) | section 8 |
