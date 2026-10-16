# Pitch: Helium on Neo4j (3 helium, then questions)

## The spoken script

**0:00** "Every team forgets three things: what it decided, when that stopped being true, and why. 'When is the UPI flow due?' has three answers across a kickoff, a standup and an email, and only the last one is right. Agents that act for a team are worse off: a chat transcript is not memory, two agents on the same task race each other, and an answer without provenance cannot be trusted."

**0:20** "Helium turns what a team said in meetings and wrote in email into one Neo4j graph with time in it. Every fact is bi-temporal: when it was true, and when we learned it. Every fact points at the utterance or the email it came from. And the agents that work for the team coordinate through the same graph."

**0:35** Tenants page. "One Neo4j database per team, two users per team. Watch what happens when orbit's reader opens nimbus." Press the probe. "Neo4j refuses. The database enforces tenancy, not our code."

**0:55** Chat: "When is the UPI flow due?" "Three hops, two media, one chain: kickoff, standup, email. Each hop has a who, a when, and a play button." Play the 0:38 hop.

**1:25** Timeline to 10 September. "Bi-temporal. This is what the team believed on the 10th, not what we know now."

**1:40** Board: "Move it to Friday". "Nobody called the scheduler. Neo4j's Change Data Capture told it the fact changed; it claimed a task with a compare-and-set under the node's write lock, re-planned, and handed the follow-up to another agent with a pointer into the graph. The same thing happens if an MCP client or a teammate in Neo4j Browser changes a fact." Press double claim: "Twenty-five agents, one winner."

**2:15** Tenant `remote`: "What did they decide about the battery?" "This is a real design team recorded in Edinburgh in 2004, the AMI corpus: regular batteries, then a kinetic battery, then none, because of the 12.50 Euro production cost. Real audio." Play a hop.

**2:40** "Under it: vector and full-text indexes, the neo4j-graphrag retriever, GDS PageRank and WCC inside one query, RBAC, CDC. Remove Neo4j and nothing here works. We built the substrate for another graph database last week; this week we rebuilt it on Neo4j, and the things you saw today are the things only Neo4j made possible."

**2:55** "Thank you."

## Built this week, built today

Say it once, early, and have it on the last slide:

- This week: the substrate rebuilt on Neo4j (one database per tenant, schema, snapshots, the lock-then-check claim).
- Today: RBAC per tenant, Change Data Capture wake-ups, the neo4j-graphrag retriever, GDS inside the queries, MCP tools, the AMI meetings with real audio, Sarvam speech to text for Hinglish.

## Questions judges ask, and the answers

**"Why not just store the transcript and use RAG?"** Retrieval finds the three UPI dates; it cannot tell you which one is current, when each stopped being true, or that the email replaced the standup. That is a graph with time on it, and it is what the agents read before they act.

**"How is this different from Neo4j Agent Memory?"** Neo4j Agent Memory remembers what the agent was told (conversations, entities, reasoning traces). Helium remembers what the team said, when it stopped being true, and who to ask; it adds bi-temporal supersession across sources, coordination between agents in the graph, and learned procedures with success rates. We use its vocabulary on purpose.

**"What breaks if you remove Neo4j?"** Tenancy (databases and RBAC), the wake-ups (CDC), recall (vector and full-text indexes), the claim (write locks), PageRank and WCC (GDS), and every answer's provenance (the Cypher in the Why panel is the answer).

**"How do you know the extracted facts are right?"** Every fact links to its utterance; the Why panel plays it. On the scripted corpus, Gemma 4 26B scores precision 0.42 and recall 0.59 against gold labels (strict match). On the real AMI meetings it scores 0.02 strict: it finds the right topic for 55% of the reviewed decisions but words them differently and mixes proposals with decisions. So the demo replays reviewed labels, `--extract real` runs the model, and the play button is the check. We publish both numbers in `docs/eval/extraction.md`.

**"Is the compare-and-set really safe on Neo4j?"** Neo4j takes the write lock at the first SET, after MATCH evaluated its predicate, so a naive version check lets two claimants through. The query bumps a lock property first, then re-reads the version under the lock. Fifty threads in the test, 25 agents in the demo, one winner each time.

**"Does CDC add latency?"** The tailer polls each tenant database every 500 ms; the scheduler woke within a second in every rehearsal. Events carry `source: cdc` and the transaction id, so you can trace a wake-up to the commit that caused it.

**"What about Aura?"** Aura Free runs the single-database half (vector, full-text, every query, Cypher fallbacks for GDS). Tenancy, RBAC and CDC need Enterprise or Aura Business Critical; `scripts/mirror_tenant.py` copies a tenant into an Aura instance.

**"Who wrote it?"** Team Vulcan. The model, queries and architecture are ours, and any of us can explain any query in `cypher/`.

## If something fails on stage

- The model is slow or rate-limited: the Why panel, timeline, board and probe need no model; ask a template question (`Who knows about PayU?`, `What is still open for Priya?`) instead of a free-form one.
- The board beat does not fire: `HELIUM_EVENTS` must be `cdc` in `.env` and the API log must show `cdc: tailing orbit, ...`. With `memory` it still works; the events say `source: writer`.
- Audio does not play: the WAV must sit under `data/meetings/`; the transcript segment highlights either way.
- Run `uv run --package helium-api python scripts/demo_check.py --with-llm` ten helium before the slot; every beat prints PASS or FAIL.
