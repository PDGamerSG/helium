# Helium Core: landing page and workspace

`apps/site` is Helium's public entrance and its live workspace.

- **The landing page** is light and short. Its hero is a company brain building itself from the Orbit sample team: meetings and email arrive, signals cross a cloud of neurons, newer facts supersede older ones without deleting them, an agent wakes, and a question reads the answer back.
- **The workspace** uses the same light graphite theme. Its timeline rail lets you drag back to any day and read what the team believed then; the Why panel shows the source behind every value.

## Run it

```bash
cd apps/site
pnpm install
pnpm dev            # http://localhost:3003
```

The workspace reads the Helium API through a same-origin proxy (`/api/helium/*`), so there is no CORS setup.

| Variable | Default | Meaning |
| --- | --- | --- |
| `HELIUM_API_URL` | `http://localhost:8081` | Where the FastAPI app from `apps/api` listens. |
| `HELIUM_SOURCE` | unset | Set to `sample` to always use the bundled Orbit sample. |

If the API can't be reached, every screen falls back to a read-only snapshot of the synthetic Orbit team (`lib/sample/`). The badge in the workspace sidebar says which source is answering: **Live API** or **Offline sample**. Actions that write to the graph (create a team, supersede a fact, the claim race) are switched off in sample mode and say why.

Workspace navigation lives in a left sidebar on desktop: Memory, Changes, Crew, and Evidence. On mobile, compact navigation sits below the workspace selector. Crew displays Signal, Relay, Tempo, Pulse, and Guide while their API IDs stay stable.

Vercel and Docker Compose use this app. From the repository root, `docker compose up --build` serves it at `http://localhost:3003`, with the proxy connected to the API container. Previous `/workspaces` and `/t/[tenant]` links redirect to the corresponding workspace pages.

```bash
pnpm typecheck && pnpm lint && pnpm build
```

## What's where

| Route | What it shows | API it reads |
| --- | --- | --- |
| `/` | The landing page: the company-brain hero, how it works, Ask with receipts, measured numbers | Build-time data from `lib/sample` (real Orbit corpus) |
| `/workspace` | Team directory, isolation probe, create a team | `GET /tenants`, `GET /tenants/{t}/acl-probe`, `POST /tenants` |
| `/workspace/[tenant]` | Core rail, belief at the cut, changes in the week before, fact list, Why panel, Ask | `/timeline`, `/meetings`, `/facts?status=all`, `/belief?t=`, `/why/{id}`, `POST /chat` |
| `/workspace/[tenant]/impact` | Work planned on superseded decisions, unsent local drafts | `/impact`, `POST /impact/{id}/draft` |
| `/workspace/[tenant]/agents` | Roster, task board and traces, learned routines, live change log, demo actions | `/agents`, `/tasks`, `/tasks/{id}/trace`, `/skills`, SSE `/events`, `POST /demo/*` |
| `/workspace/[tenant]/sources` | Meetings and email threads, transcripts with audio seek, facts per source | `/meetings`, `/meetings/{id}/episodes`, `/meetings/{id}/audio`, `/threads`, `/threads/{id}/messages` |

Key files:

- `components/home/BrainDemo.tsx`: the hero.
  - It plays five beats (kickoff, standup, email, client call, ask) on a loop while it is on screen.
  - It has a pause button and clickable steps.
  - Under reduced motion it shows the finished memory.
- `components/home/brain-graph.ts` and `brain-canvas.ts`: the hero's machinery.
  - `brain-graph.ts` holds the node layout for wide and narrow screens, the timing of each beat, the seeded neuron mesh and signal routing.
  - `brain-canvas.ts` is the canvas 2D renderer: drifting neurons, synapse firing, edges and signals. Labels are HTML on top.
- `components/home/AskDemo.tsx`: three real questions with cited sources, including one the record can't answer.
- `lib/orbit.ts`: derives the landing's story from the sample at build time, so every date, quote and count is real corpus data.
- `app/api/helium/[...path]/route.ts` and `lib/sample-api.ts`: the proxy and the read-only sample stand-in.
- `components/workspace/*`: shell, core rail, Why and Ask panels, and the screens.

## Refreshing the sample

`lib/sample/*.json` was captured from the API's read endpoints over the Orbit corpus (`data/meetings`, `data/generator`). Tenants and health were normalised to the Neo4j response shape, and Cypher strings come from `cypher/31_belief_at_time.cypher`, `32_why_path.cypher`, `81_work_impacts.cypher` and friends. To refresh it, seed a running API (`docs/helium-demo.md`) and re-capture the same `GET` routes.

## Images

| File | Source | License |
| --- | --- | --- |
| `public/images/gisp2-core-1837m.webp` | GISP2 core, 1,837–1,838 m. USGS National Ice Core Laboratory, via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:GISP2D1837_crop.jpg) | Public domain (US government work). Resized, tinted on the page. |
| `public/images/eastgrip-core-tray.webp` | EastGRIP ice core, Helle Astrid Kjær, via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:The_EastGRIP_ice_core_freshly_cut_2.jpg) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Resized and desaturated. |
| `public/images/workspace-core-v2.webp` | Screenshot of this workspace reading the Orbit team | Project asset |

The earlier landing page showed these photos with their credits; the current landing page doesn't use them.
