---
name: Helium
description: Memory with a trail.
colors:
  paper: "#ffffff"
  paper-2: "#f5f5f6"
  paper-3: "#ececef"
  coal: "#0e0e10"
  coal-2: "#52525b"
  coal-3: "#74747d"
  graphite: "#111113"
  signal: "#ff5a1f"
  signal-ink: "#b4380b"
  signal-soft: "#fff0e8"
  flag: "#c8321f"
  hairline: "rgb(14 14 16 / 0.09)"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.6rem, 5vw, 4.25rem)"
    fontWeight: 640
    lineHeight: 1.02
    letterSpacing: "-0.042em"
  headline:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.9rem, 3.2vw, 2.75rem)"
    fontWeight: 640
    lineHeight: 1.08
    letterSpacing: "-0.036em"
  page-title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 2.6vw, 2.25rem)"
    fontWeight: 640
    lineHeight: 1.1
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 620
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 560
    lineHeight: 1.3
  button:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 560
    lineHeight: 1
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.78rem"
    lineHeight: 1.65
rounded:
  tag: "5px"
  chip: "6px"
  field: "10px"
  row: "10px"
  sheet: "12px"
  card: "16px"
  panel: "24px"
  full: "999px"
spacing:
  gutter-mobile: "24px"
  gutter-desktop: "40px"
  container: "1240px"
  section: "96px"
components:
  button-primary:
    backgroundColor: "{colors.coal}"
    textColor: "#ffffff"
    typography: "{typography.button}"
    rounded: "{rounded.full}"
    padding: "0 18px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "#2a2a2e"
  button-primary-disabled:
    backgroundColor: "{colors.paper-3}"
    textColor: "{colors.coal-3}"
  button-line:
    backgroundColor: "#ffffff"
    textColor: "{colors.coal}"
    rounded: "{rounded.full}"
    padding: "0 18px"
    height: "44px"
  button-sm:
    padding: "0 14px"
    height: "36px"
  field:
    backgroundColor: "#ffffff"
    textColor: "{colors.coal}"
    rounded: "{rounded.field}"
    padding: "0 14px"
    height: "44px"
  tab-selected:
    backgroundColor: "{colors.paper-3}"
    textColor: "{colors.coal}"
  mark-current:
    backgroundColor: "{colors.signal-soft}"
    textColor: "{colors.signal-ink}"
    rounded: "{rounded.tag}"
    padding: "0.08em 0.45em 0.1em"
  mark-superseded:
    textColor: "{colors.coal-3}"
  mark-review:
    textColor: "{colors.flag}"
  mark-draft:
    textColor: "{colors.coal-2}"
    rounded: "{rounded.chip}"
  cite-chip:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.coal-2}"
  cite-chip-active:
    backgroundColor: "{colors.coal}"
    textColor: "#ffffff"
  sheet:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.coal}"
    rounded: "{rounded.sheet}"
  card:
    backgroundColor: "#ffffff"
    rounded: "{rounded.card}"
  workspace-header:
    backgroundColor: "#ffffff"
    height: "56px"
  drawer:
    backgroundColor: "#ffffff"
    width: "30rem"
---

## Overview

**Creative North Star: "Graphite, with one signal"**

Helium is a company brain that remembers what changed. The interface reads like a well-kept lab notebook: white paper, graphite type and hairlines. Exactly one colour, signal orange, marks what is current or new.

The landing page and the workspace are one system at two densities:

- **The landing page** (`/`) is short and Granola-simple. Its hero is a live company-brain demo built from the Orbit sample.
- **The workspace** (`/workspace`) is a dense tool. It has a 56px white header, a timeline rail on the left, a 30rem drawer on the right, segmented tabs and rows of facts.

On 17 Oct 2026 the user replaced two earlier directions, so neither should come back:

- A dark navy "ice core" theme with peach, cyan and rose accents.
- A cream, coral and serif look, which read as "AI made".

**Key Characteristics:**
- Pure white and cool greys; no beige, no navy.
- One colour: orange, only for meaning.
- Archivo everywhere, set tight. JetBrains Mono only for Cypher and IDs.
- State is a mark plus a word, never colour alone.
- Pill buttons, soft corners (10 to 16px) and hairline borders. Shadows only on floating things.
- Every animated surface has a reduced-motion path, and the brain demo has a screen-reader summary.

## Colors

### Signal
- **Signal orange** (#ff5a1f) marks what is current or new:
  - the current-fact dot and new-information pulses in the brain demo;
  - days with a supersession on the timeline rail;
  - the live dot in the source badge and the change log;
  - the history dot of a value in force;
  - the band in the logo.
- **Signal ink** (#b4380b) on **signal soft** (#fff0e8) is the "in force" tag (`mark-current`, `lp-tape`). Its contrast is 5.5:1.

### Graphite
- **Coal** (#0e0e10) is used for text, primary buttons, the active nav underline, the timeline cut, selected tabs' text, answer paths and agents.
- **Coal 2** (#52525b) is secondary text (7.7:1).
- **Coal 3** (#74747d) is muted text and superseded values (4.6:1).
- **Graphite** (#111113) is the landing page's dark "Ask" band and code wells.

### Surfaces
- **Paper** (#ffffff) is the page, cards, the header and the drawer.
- **Paper 2** (#f5f5f6) is evidence sheets, side rails and hover.
- **Paper 3** (#ececef) is the selected row or tab.
- **Hairlines** are rgb(14 14 16 / 0.09).

### Review
- **Flag** (#c8321f) is only for "needs review" and errors. It always travels with the folded-flag icon or an error title.

### Named Rules
- **One Colour Rule.** Orange means current or new. It is never decoration, a category colour or a background wash.
- **Retired palettes.** The old navy tokens (`g-*`, `frost`, `rime`, `slate`, `he`, `ice`, `sheet`, `ink`) remain in `globals.css` only for the unused components in `components/core` and `components/landing`.

## Typography

**Archivo** at its normal width (`wdth` 100):
- **Display:** weight 640 and -0.04em tracking for headlines.
- **Page titles:** weight 600 to 640.
- **Body:** weight 400.

**JetBrains Mono** is only for Cypher, IDs and event names. People's words are set in the body face inside quotation marks; there is no serif.

### Hierarchy
- **Display** (landing hero, Ask headline): clamp(2.6rem, 5vw, 4.25rem).
- **Headline** (landing sections): clamp(1.9rem, 3.2vw, 2.75rem).
- **Page title** (workspace, `.t-h2`): clamp(1.75rem, 2.6vw, 2.25rem).
- **Title** (cards, list headings): 1.15rem, weight 620.
- **Label** (`.t-label`): 0.78rem, weight 560, coal 3. Sentence case, no uppercase eyebrows.

## Layout

- **Landing page:**
  - Max width 1240px, with 24px gutters on mobile and 40px on desktop.
  - The hero has two columns from 1280px; below that it stacks so the demo stays readable (13px labels or more).
  - Five blocks: hero, how it works, the graphite Ask band, measured numbers, and a closing panel. Then the footer: a brand column, Product and On this page link columns, and a bottom bar.
- **Workspace:**
  - The header is 56px.
  - The Core page has a 9.5rem timeline rail.
  - The Why and Ask drawer is 30rem; below 1280px it is a full-height overlay.

## Elevation & Depth

Resting surfaces are flat, separated by hairlines and the paper steps. Shadows are reserved for:
- the floating landing nav;
- the hero product window and the Ask card (0 24px 56px -28px rgb(14 14 16 / 0.28));
- popovers and tooltips (0 18px 40px -16px rgb(14 14 16 / 0.18)).

## Shapes

- **Buttons and pills:** 999px.
- **Fields and rows:** 10px.
- **Evidence sheets:** 12px.
- **Cards:** 16px.
- **Landing panels:** 24px.
- **Tags:** 5px.

## Components

### Mark
The logo is an **H**:
- the left stem is hollow (what was true before);
- the right stem is solid (what is true now);
- an orange bar joins them (the supersession).

It is drawn in `currentColor` with a fixed orange bar, so it works on white and on graphite. The favicon puts it white on a graphite tile.

### Buttons
- **Primary:** a graphite pill. Hover is #2a2a2e; disabled is paper 3 with coal 3 text.
- **Line:** a white pill with a 14% hairline; on hover the border rises to 30% with a paper 2 fill.
- **One primary per group.**

### State marks
- **In force:** the orange tag.
- **Superseded:** coal 3 struck through, with an "until" date where it fits.
- **Needs review:** a folded flag in flag red.
- **Unsent draft:** a dashed outline with a pencil.

### Evidence
Quotes, emails and drafts sit on the paper 2 sheet. The matched value is highlighted in #ffe0cf.

### Timeline rail
A light capsule:
- meetings are graphite bands sized by how much was said;
- emails are thin lines;
- supersessions are orange lines;
- the cut is a graphite line with a graphite date label.

It is labelled "Latest" at the top and "Earliest" at the bottom, and works with the keyboard as a slider.

### Company-brain demo
- **Mechanics:** a canvas neuron cloud with HTML labels on top.
- **Signals:** writes pulse orange and glow; reads (agents, questions) are crisp ink dots.
- **Steps:** five clickable beats, with pause.
- **Reduced motion:** shows the finished memory.

### Source badge
- **Live API:** a white pill with an orange dot.
- **Offline sample:** a dashed outline.

## Do's and Don'ts

### Do:
- **Do** keep orange for what is current or new, and nothing else.
- **Do** pair every state with its mark and its word.
- **Do** use tabular numerals for dates, counts and timings.
- **Do** keep copy short: one idea per line, sentence case.
- **Do** give every animated surface a reduced-motion path.

### Don't:
- **Don't** use beige or cream grounds, coral or terracotta, or serif headlines. That combination read as "AI made".
- **Don't** add decorative panels, pastel icon tiles, gradients, glows or coloured window chrome.
- **Don't** reintroduce the navy theme, cyan or rose accents, or the ice-core metaphor in copy ("surface", "deepest layer").
- **Don't** resemble Minutes: no paper-white with cobalt, no Cal Sans or Manrope, no nine-tile block mark.
- **Don't** show state by colour alone, or put two primary buttons side by side.
