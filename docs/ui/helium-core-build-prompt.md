# Helium Core UI: build prompt

Generated with the `prompt-master` skill (Template M, Claude Code). It is the brief this UI was built from. Paste it into Claude Code (or adapt it for another coding agent) to rebuild or extend the UI.

```
## Objective
Build Helium's public entrance and live workspace in apps/site as one visual world, "Helium Core":
team memory as an ice core, where every day of meetings and email is a layer, superseded decisions
stay preserved deeper down, and drilling to a depth shows what the team believed on that date.
It must look nothing like Minutes (the upstream prototype on localhost:3001).

## Context
- Monorepo: FastAPI in apps/api (contract: docs/contracts/http-api.md), Next.js workspace in apps/web,
  product record in PRODUCT.md, direction contract in .impeccable/surfaces/apps-site-app-page-tsx.md.
- Stack in apps/site: Next.js 16 App Router, React 19, Tailwind CSS 4, three + @react-three/fiber.
- Real story from the synthetic Orbit corpus (data/meetings, data/generator):
  7 Sep kickoff: UPI flow due 24 Sep, payments on Razorpay (Aditya, Priya).
  14 Sep standup: UPI flow moves to 25 Sep. 17 Sep email from Priya: moves to 28 Sep.
  21 Sep standup confirms 28 Sep. 23 Sep Meridian call: payments switch to PayU.
- Measured numbers (docs/design/pitch.md): 954 ops/s, read p50 18 ms, p99 43 ms, one winner in
  every 25-way claim race, fact change to agent reaction under one second.
- Minutes look to avoid: paper-white ground, cobalt #3155ed, Cal Sans/Manrope/Inter, nine-tile mark,
  isometric block sculpture, centered SaaS hero.

## Target State
- "/" landing: hero with a WebGL ice core whose bands are Orbit's real meetings and emails; a pinned
  scroll "drill" from 16 Oct down to 7 Sep showing the UPI date superseded twice; a light-table
  belief scrubber; receipts with real quotes and the Cypher that ran; agents waking on a change;
  Neo4j internals with measured numbers; a closing call to open the workspace.
- "/workspace": tenant directory from GET /tenants with an isolation probe.
- "/workspace/[tenant]": core rail timeline, belief at a dragged date (GET /belief?t=), Why panel
  (GET /why/{id}) with source text, supersession history, Cypher; Ask (POST /chat) with sources.
- "/workspace/[tenant]/impact", "/agents", "/sources": decision impact with unsent local drafts,
  agent board with live SSE events and demo actions, meetings and email threads with episodes.
- API proxied through a Next.js route (HELIUM_API_URL, default http://localhost:8081); when the API
  is unreachable, every screen falls back to a bundled Orbit sample and says so.

## Scope
- Work only in: apps/site/**, docs/ui/**, .impeccable/**, PRODUCT.md, DESIGN.md.
- Do NOT touch: apps/api, apps/web, packages, data, cypher, .env files, uv.lock.

## Constraints
- Palette: deep slate-teal ground, frost white text, helium yellow (D3 line) only for current
  values and the primary action, coral for needs review, struck ash for superseded.
- Type: Archivo across widths for display and UI; Spectral italic only for quoted human words;
  JetBrains Mono only for Cypher and IDs. No eyebrow labels, no 01/02/03 markers, no card grids.
- State is shown by a mark (strike, tape band, folded flag, pencil outline) plus text, never color alone.
- No new dependencies beyond three and @react-three/fiber. Never call mutating endpoints automatically.
- Only make changes directly requested.

## Acceptance Criteria
- [ ] pnpm typecheck, pnpm lint and pnpm build pass in apps/site.
- [ ] Landing renders at 1440x900 and 390x844 with no horizontal overflow; reduced motion shows a
      static core; no WebGL shows an SVG core.
- [ ] Workspace screens render live data against a running API and the sample without one.
- [ ] Every interactive control is keyboard reachable with a visible focus ring.

## Action Boundaries
- Proceed with reversible, in-scope inspection, edits, and validation.
- Stop and ask before deleting files outside apps/site, adding dependencies, or calling POST endpoints
  against a shared API.

## Progress Evidence
Report progress only at checkpoints. Ground every completion claim in a tool result, changed file,
or verification output.
```

🎯 Target: Claude Code (Opus 5), 💡 Front-loads the world, the real corpus facts and the anti-Minutes constraints so a fresh session builds the same UI without re-deriving them.

This prompt is for an agentic tool with real system access. Review the scope locks, forbidden actions, and stop conditions before pasting. Confirm file paths, directories, and permissions match the actual project.
