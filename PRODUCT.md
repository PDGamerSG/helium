# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences carry equal weight:

- **Hackathon judges** watching a three-minute stage demo, then clicking through the product themselves. They need to grasp the mechanism in one screen and see that the graph is real.
- **Teams evaluating Helium**: product, delivery and consulting leads whose teams run on meetings and email threads and are adding agents to their work. The buyer is the person who is tired of being the team's memory.

Day to day, team members ask what is current and why; team leads move dates and review the impact of a changed decision; operators seed tenants and check the system before a demo.

## Product Purpose

Helium turns what a team says in meetings and writes in email into a Neo4j graph that knows what is true now, what was true before, who said it and why. The team's agents coordinate through that same graph. Success: anyone can answer "what is current, since when, and who said it" with a source they can open, and a changed decision shows the work it touches.

## Positioning

A meeting bot remembers a meeting, an agent memory remembers an agent; Helium remembers a team, with time in it. Every fact is bi-temporal (valid time and transaction time). A newer statement supersedes the older one and links to it, so nothing is overwritten. Agents work inside that memory: they wake from Neo4j Change Data Capture, claim tasks with compare-and-set, and hand off context as graph pointers.

## Operating Context

- Sources: recorder exports and audio (Sarvam speech to text, Hindi/English/Hinglish), email threads (`.eml`, `.mbox`, JSON).
- One Neo4j database per tenant, with server-enforced RBAC; MCP clients (Cursor, VS Code) read the same memory.
- Core workflows: ask a question and open the Why panel; scrub the timeline to see belief at a date; review decision impact on work items; watch the agent board react to a superseded fact.
- API: FastAPI in `apps/api` (contract in `docs/contracts/http-api.md`). Workspace: Next.js in `apps/web`. Public entrance: `apps/site`.

## Capabilities and Constraints

- Temporal facts with supersession, confirmation and provenance (speaker, utterance with play-at offset or email, the Cypher that ran, the subgraph).
- Belief at time T, Why chains (`SUPERSEDES*1..10`), hybrid vector plus full-text recall, GraphRAG search.
- Agents: Fact, FollowUp, Scheduler, Standup, Answer. A2A task states, CAS claims, hand-offs, artifacts. Follow-up drafts are local and never sent automatically.
- Skills learned from repeated meetings, with success rates and GDS PageRank.
- Known gap: no login or tenant membership on the API yet.
- Terminology: fact, decision, commitment, episode, supersedes, confirms, belief at, tenant, draft (always "unsent" until a person sends it).

## Brand Commitments

- Name: Helium. Tagline in `brand.json`: "Memory with a trail."
- Voice: clear, grounded, quietly confident.
- Helium is a distinct project from Minutes (the upstream prototype served on localhost:3001). Its UI must not resemble Minutes in any way: no paper-white and cobalt palette, no Cal Sans or Manrope, no nine-tile block mark, no isometric block sculpture.

## Evidence on Hand

- Synthetic Orbit tenant corpus (`data/meetings`, `data/generator`, `data/gold`): Aditya (lead), Priya (backend), Rahul (mobile), Sana (design), Farah (Meridian compliance).
  - 7 Sep kickoff: UPI flow due 24 Sep; payments go through Razorpay.
  - 14 Sep standup: UPI flow moves to 25 Sep.
  - 17 Sep email from Priya: UPI flow moves to 28 Sep (cross-source supersession).
  - 21 Sep standup: 28 Sep confirmed.
  - 23 Sep Meridian call: payments switch to PayU, superseding the kickoff decision.
  - Release ships 16 Oct.
- Real data: AMI Meeting Corpus (four design meetings, CC BY 4.0) with audio.
- Measured on one laptop (docs/design/pitch.md): 954 mixed ops/s with 20 agents across 4 tenants; read p50 18 ms, p99 43 ms; exactly one winner in every concurrent-claim run; fact change to agent reaction under one second.
- Absent: customer logos, testimonials, pricing, production deployments. Do not invent them. Corpus examples must be labelled illustrative when shown outside the live workspace.

## Product Principles

- Evidence before answers: no source, no claim. Insufficient evidence is a visible answer.
- Supersede, never overwrite: the old value stays readable with its date and source.
- Show the query: every answer can expose the Cypher that produced it.
- People decide: agents draft and hand off; nothing is sent on a person's behalf.

## Accessibility & Inclusion

Keyboard access, visible focus, reduced-motion support and a non-WebGL fallback for every 3D or animated surface; status is always named in text, never by colour alone.
