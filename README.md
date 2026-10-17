<div align="center">

# 🎈 Helium

### Memory with a trail.

**What is true now · Who said it · What it replaced**

[![Download](https://img.shields.io/badge/download-ZIP-2f6fde?style=for-the-badge)](https://github.com/PDGamerSG/helium/archive/refs/heads/main.zip)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux-555?style=for-the-badge)
![Database](https://img.shields.io/badge/needs-Neo4j%20Enterprise-018bff?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-1a7f37?style=for-the-badge)

<img src="docs/screenshot-main.png" width="720" alt="Helium landing page: the Orbit sample team's memory, with a newer payments decision replacing an older one">

</div>

Helium turns what your team says in meetings and writes in email into one memory that knows what is true now, what was true before, who said it, and what replaced it. Your agents read and write that same memory. Use it to answer "when is this due, and who said so?", to see which work a changed decision touches, or to give Cursor and VS Code your team's context.

## 💡 Why you'll like it

| | |
|---|---|
| 🕰️ **Read any day** | Drag the timeline back to a date and see what the team believed then. |
| 🧾 **Receipts on every answer** | Each value links to the meeting line or email that set it, with the speaker and the time. |
| 🔁 **Nothing overwritten** | A newer statement replaces an older one, and the older one stays readable with its date and source. |
| 🎯 **Changes show their impact** | When a decision changes, Helium lists the planned work that still depends on the old value. |
| 🤖 **Agents share one memory** | Agents wake when a fact changes, and only one agent can claim a given task. |
| 🔌 **Ask from your editor** | Cursor, VS Code, and other MCP clients can query the same memory. |
| ✋ **People decide** | Agents write follow-up drafts locally. Nothing is sent on your behalf. |

## 🚀 Three steps

<img src="docs/screenshot-workspace.png" width="720" alt="The Helium workspace with the Why panel open, showing the email that moved a due date and the values it replaced">

1. **Bring in meetings and email.** Recorder exports, audio, and email threads become dated facts, decisions, and commitments.
2. **Ask what is true.** Ask a question, or open any value to see who said it, when, and what it replaced.
3. **Act on the change.** Review the work a changed decision touches, and let an agent draft the follow-up.

## 📥 Download

1. Download the [ZIP of this repo](https://github.com/PDGamerSG/helium/archive/refs/heads/main.zip) and unzip it, or clone it with Git.
2. Copy the example settings and start Neo4j. The compose file accepts Neo4j's **evaluation** license for the Enterprise image; read Neo4j's terms before you use it for anything else.

   ```bash
   cp .env.example .env
   docker compose up -d neo4j
   ```

3. Install the Python packages, load the three sample teams, and start the API on port 8081.

   ```bash
   uv sync --all-packages
   uv run --package helium-api python data/seed.py --tenants orbit,nimbus,quill --reset
   uv run --package helium-api uvicorn apps.api.main:app --port 8081
   ```

4. Start the workspace in a second terminal and open <http://localhost:3003>.

   ```bash
   cd apps/site
   pnpm install
   pnpm dev
   ```

Only want to look around? Run step 4 alone with `HELIUM_SOURCE=sample pnpm dev`. The workspace then reads a bundled snapshot of the Orbit sample team, and actions that write to the graph are switched off.

The seed script replays reviewed labels by default, so it needs no language model. Set `LLM_BACKEND=fake` and `EMBED_BACKEND=fake` in `.env` to skip model downloads entirely.

| Requirement | Details |
|---|---|
| Docker | Runs Neo4j Enterprise with APOC and Graph Data Science. The compose file gives Neo4j up to 2 GB of heap and 512 MB of page cache. |
| Python | 3.12 or 3.13, with [uv](https://docs.astral.sh/uv/). |
| Node.js | 20 or newer, with pnpm 10. |
| Language model | Optional for the sample data. Ollama (`gemma4:e4b`) by default; Gemini and OpenRouter are also supported. |
| Embeddings | EmbeddingGemma (ONNX), downloaded on first use. |
| Speech to text | Optional. A Sarvam API key for audio in Hindi, English, and Hinglish. |
| Not supported | Logins and per-user access on the API. Windows is not tested. No hosted version. |

## 🔍 What it does

| Stage | What happens |
|---|---|
| Ingest | Recorder exports, audio, and email (`.eml`, `.mbox`, JSON) are stored as episodes with their speakers and times. |
| Extract | Facts, decisions, and commitments are pulled from each episode and linked to the person and line that produced them. |
| Supersede | A newer value links to the value it replaces. Both keep the time they were true and the time Helium learned them. |
| Recall | Questions run hybrid vector and full-text search plus graph paths. Every answer can show the Cypher query that produced it. |
| React | Neo4j Change Data Capture wakes Signal, Relay, Tempo, Pulse, and Guide. Task claims use compare-and-set, so one claim wins. |
| Impact | Work items planned on a superseded decision are listed. An agent can write an unsent local draft for each one. |
| Isolate | Each team gets its own Neo4j database, with access enforced by the database. |

## ⚙️ How it works

```text
 meetings, audio, email ──► ingest ──► Neo4j graph ◄──► FastAPI ◄──► workspace (Next.js)
                                        │      ▲
                          change events │      │ claims, hand-offs
                                        ▼      │
                                         agents

 Cursor, VS Code ◄──► MCP server ◄──► Neo4j graph
```

| Component | Purpose | License |
|---|---|---|
| `packages/hiveboard` | Temporal memory, task coordination, Change Data Capture, MCP server | MIT |
| `packages/ingest` | Recorder and email formats, extraction, embeddings | MIT |
| `apps/api` | FastAPI routes, agents, and background workers | MIT |
| `apps/site` | Landing page and live workspace | MIT |
| `cypher/` | Numbered graph queries and schema | MIT |
| Neo4j Enterprise, Graph Data Science | Graph database, per-team databases, access control, Change Data Capture, PageRank | Neo4j's terms (evaluation license in `docker-compose.yml`) |
| APOC | Neo4j procedure library | Apache 2.0 |
| EmbeddingGemma | Default text embeddings | Gemma Terms of Use |
| AMI Meeting Corpus | Real meeting recordings used for evaluation | CC BY 4.0 |

## ☁️ Explore in the Aura console

To share a team's memory without asking everyone to run Docker, copy it into a [Neo4j Aura](https://console.neo4j.io) instance and open it in the Aura console's **Query**, **Explore**, and **Dashboards** tools. Aura holds one database per instance, so it holds one team at a time. It is a read-only copy for exploring; the Helium API and agents still run against your local Neo4j.

1. Create an Aura instance (AuraDB Free works) and keep the credentials file Aura downloads, for example `Neo4j-<id>-Created-<date>.txt`.
2. Load the sample teams locally (step 3 of [Download](#-download)), then copy one team into Aura:

   ```bash
   uv run --package helium-api python data/seed_work.py --tenants orbit
   uv run --package hiveboard python scripts/mirror_tenant.py --tenant orbit --to-env ~/Downloads/Neo4j-<id>-Created-<date>.txt --wipe
   ```

   `--wipe` clears the Aura database first. The script reads the URI, user, password, and database from the credentials file, so the password never appears on the command line. It copies the indexes too, so vector and full-text search work in Aura.
3. In the Aura console, open **Query**, connect to the instance, and try these:

   ```cypher
   // What is true now, and who said it
   MATCH (f:Fact {status: 'active'})-[:STATED_BY]->(p:Person)
   RETURN f.kind AS kind, f.text AS what, p.name AS said_by, datetime({epochMillis: f.valid_from}) AS since
   ORDER BY since DESC LIMIT 25

   // What replaced what (switch to the graph view)
   MATCH p = (:Person)<-[:STATED_BY]-(:Fact)-[:SUPERSEDES]->(:Fact)
   RETURN p

   // The meeting line or email behind each value
   MATCH (f:Fact {status: 'active'})-[:DERIVED_FROM]->(ep:Episode)<-[:HAS_EPISODE]-(source)
   OPTIONAL MATCH (ep)-[:SPOKEN_BY|SENT_BY]->(p:Person)
   RETURN f.text AS fact, p.name AS speaker, coalesce(source.title, source.subject) AS source, ep.text AS line
   LIMIT 10

   // Work planned on a value that has since changed
   MATCH (w:WorkItem)-[:DEPENDS_ON]->(planned:Fact {status: 'superseded'})
   OPTIONAL MATCH (w)-[:OWNED_BY]->(owner:Person)
   OPTIONAL MATCH (current:Fact {status: 'active'})-[:SUPERSEDES*1..24]->(planned)
   RETURN w.title AS work, owner.name AS owner, planned.text AS planned_on, current.text AS true_now
   ```

Aura reports itself as Enterprise and lists the Graph Data Science and Change Data Capture procedures, but on AuraDB Free it cannot create databases, its GDS procedures need a separate Graph Analytics session, and Change Data Capture is off. `HiveDB.capabilities()` detects this, and on Aura it reports `aura: true` and `multi_database`, `gds`, and `cdc` as false. Code pointed at Aura then uses the Cypher fallbacks for PageRank and connected components, and the in-process event bus.

## 🛡️ Responsible use

Helium stores what people say and write. Tell people before you record or import their meetings and email, and follow your workplace's rules for keeping that data. Agents only draft messages; a person must send them. The API has no login yet, so keep it on a private network.

## ⚠️ Known limits

- The API has no login or team membership yet. Anyone who can reach the API can open any team.
- Extraction from real meetings is weak. On the AMI meetings, strict-match precision and recall are 0.02. On the scripted sample corpus they are 0.42 and 0.59 (Gemma 4 26B). The demo replays reviewed labels.
- Performance numbers come from one laptop: 954 mixed operations per second with 20 agents across 4 teams, and read latency of 18 ms at p50 and 43 ms at p99. There is no production deployment.
- Per-team databases, database access control, and Change Data Capture need Neo4j Enterprise.
- In the MCP server, `search` and `recall` use a simple word-overlap embedder unless you supply one, so they do not rank by meaning.
- The sample teams and their dates are synthetic and only illustrate the product.
- Tested on macOS and in Linux CI. On Windows 11, only seeding the sample teams and the Aura mirror have been run.
- The interface is in English only.

## 🛠️ Development

Prerequisites: Git, Docker, Python 3.12 or 3.13 with uv, and Node.js 20 or newer with pnpm.

```bash
git clone https://github.com/PDGamerSG/helium.git
cd helium
uv sync --all-packages
```

Run the Python tests and lint checks:

```bash
uv run pytest packages/hiveboard/tests packages/ingest/tests apps/api/tests -q
uv run ruff check packages apps data scripts
```

Check and build the workspace:

```bash
cd apps/site
pnpm install
pnpm typecheck && pnpm lint && pnpm build
```

| Folder | Contents |
|---|---|
| `cypher/` | Numbered graph queries and schema |
| `packages/hiveboard/` | Neo4j memory, coordination, Change Data Capture, MCP server |
| `packages/ingest/` | Recorder and email contracts, extraction, embeddings |
| `apps/api/` | FastAPI routes, agents, and workers |
| `apps/site/` | Landing page and live workspace (see [`apps/site/README.md`](apps/site/README.md)) |
| `apps/web/` | Earlier Next.js workspace shell |
| `data/` | Synthetic sample teams, gold labels, and evaluation fixtures |
| `docs/` | Architecture, API contracts, and demo runbooks |
| `scripts/` | Demo and brand checks, and `mirror_tenant.py` (copy one team into Aura) |

More detail: the demo runbook in [`docs/helium-demo.md`](docs/helium-demo.md), the HTTP API in [`docs/contracts/http-api.md`](docs/contracts/http-api.md), and MCP setup in [`docs/mcp.md`](docs/mcp.md).

## 📄 License

[MIT](LICENSE). Helium builds on the `helium-neo4j` prototype; see [`docs/UPSTREAM.md`](docs/UPSTREAM.md) for attribution.
