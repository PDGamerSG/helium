# Helium Core: design record

Built 16 October 2026 in `apps/site`, replacing the earlier dark/ember scaffold that was there. The goal: a Helium UI that shares nothing with Minutes, the upstream prototype served on localhost:3001 (paper white, cobalt `#3155ed`, Cal Sans and Manrope, isometric block cubes, a centred SaaS hero).

## The idea

**Team memory is an ice core.** Every day of talk leaves a layer. Nothing melts: a superseded decision stays readable, dated and attributed, deeper down. Drilling to a depth reads what the team believed on that date. This maps directly onto Helium's mechanism:

| Ice core | Helium |
| --- | --- |
| One layer per year of snow | One layer per day of meetings and email |
| Trapped air bubbles | Episodes: every utterance and email, kept as the source |
| Old layers stay readable | `SUPERSEDES` links: the old value gets an end date, never a delete |
| Read the atmosphere at a depth | `belief_at(t)`: what was in force on a date |
| Ice age and gas age differ (Δage) | Valid time and transaction time are stored separately |

## Concepts considered

| Concept | Why it was or wasn't chosen |
| --- | --- |
| **Ice core** (built) | Literal to the bi-temporal model, a natural 3D object, and it carries a scroll story (drill down = go back in time). |
| Strata or sediment cutaway | Same time metaphor, but the warm earth palette lands on the cream-and-terracotta look every AI tool produces. |
| Spectrograph (helium's D3 line) | Helium was found as an unexplained yellow line in sunlight, a good evidence story. Too close to the old apps/site spectrum design. |
| Weather balloon and stratosphere | Helium lifts, altitude equals time. Playful but weak for provenance. |
| Glass time slabs | A stack of daily panes with facts as light. Cinematic but generic "dark glow". |
| Evidence board or chain of custody | Strong for provenance and hand-offs, but it frames teammates' words as testimony. |

The impeccable skill's concept roll was run (seed `43c41f6d`). It assigned a different grounded candidate; the user's instruction "choose what you like" decided it. Its challengers donated these disciplines:

- State is shown as a mark, not just a hue: tape for in force, a strike for superseded, a flag for review, a pencil outline for drafts.
- The depth rail doubles as navigation.
- One date control drives the whole belief view.
- Every bubble is a real episode.

## References studied

Zep, Mem0, Sentra, Granola, Neo4j, Linear, Dust, Glean, Lusion and Igloo Inc were captured and measured (nav behaviour, buttons, backgrounds, proof). What was adopted:

- A nav that is transparent over the hero, then a frosted floating bar with an active-section marker. All the competitors keep the nav visible; Helium hides it only while you scroll down, so the drill stays immersive.
- Question → answer → citation, as Sentra does it, **plus what Sentra never shows**: an "as of" date and the superseded answers kept on record.
- Real product UI on the landing (the workspace screenshot), and real ice-core photography in place of abstract renders.
- Avoided: constellation-network heroes, logo walls and invented counters, gradient blobs, scroll-jacking loaders.

## Visual system

- **Palette.** Polar-night navy `#0b111c` (raised `#121a28`), frost `#eef3f9`, secondary `#b3c0d3`, muted `#8593aa`, ice cyan `#8fe3ff` for data and live state, helium peach `#ffae8a` for current values and the primary action (the glow of a helium discharge tube), rose `#ff6b8b` for needs review, struck ash `#7e8ba0` for superseded. Cool white `#f3f6fa` "light table" sheets carry evidence. The first palette (teal ground with mustard yellow) was replaced at the user's request. All text pairs pass WCAG AA; the status colours pass the dataviz validator's colour-blind separation.
- **Type.** Archivo across its width axis: expanded and heavy for display, normal width for UI, condensed for labels. Spectral italic only for human words (quotes, transcripts). JetBrains Mono only for Cypher and IDs.
- **Motion.** One orchestrated moment: the scroll drill, which dives into the core, stops at five dated layers, then lays the core flat so time runs left to right into the next section. Supporting motion: diamond dust, a scanner-line reveal on section headings, the GISP2 strip panning like a line scan, the workspace screenshot settling flat, the agent trace, and the claim race. Everything respects `prefers-reduced-motion`, and without WebGL the core renders as SVG.

## Honesty rules the UI follows

- Every landing example is real Orbit corpus data, labelled as the synthetic sample.
- The claim race on the landing is a labelled replay of the measured result. The workspace runs the real `POST /demo/double-claim`.
- Benchmark numbers come from `docs/design/pitch.md`.
- The workspace says whether it shows the live API or the offline sample, and the sample refuses writes.

## Prompt

The reusable build brief, written with the prompt-master skill, is in [`helium-core-build-prompt.md`](helium-core-build-prompt.md).
