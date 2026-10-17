/**
 * The hero's company-brain demo: where each node sits, when it appears, and which signals cross the mesh.
 * Coordinates are logical pixels inside each layout's box; the stage scales the box to its width.
 */

export type LayoutKey = "wide" | "tall";
type Pt = readonly [number, number];

export const BOX: Record<LayoutKey, { w: number; h: number }> = {
  wide: { w: 640, h: 420 },
  tall: { w: 360, h: 680 },
};

/** Length of each beat in ms: kickoff, standup, email, client call, ask. The loop rests briefly between runs. */
export const BEAT_MS = [3400, 3200, 4600, 3200, 6200] as const;
export const LAST_BEAT = BEAT_MS.length - 1;
export const REST_MS = 700;

export type NodeId = "s0" | "s1" | "s2" | "s3" | "upi" | "pay" | "f24" | "f25" | "f28" | "fraz" | "fpayu" | "agent" | "draft" | "ask";
export type NodeKind = "source" | "hub" | "fact" | "agent" | "draft" | "ask";

export type BrainNode = {
  id: NodeId;
  kind: NodeKind;
  /** The beat it appears in, and how far into that beat (ms). */
  beat: number;
  delay: number;
  /** When a newer fact supersedes it: beat, and ms into that beat. */
  replaced?: readonly [number, number];
  at: Record<LayoutKey, Pt>;
};

export const NODES: BrainNode[] = [
  { id: "s0", kind: "source", beat: 0, delay: 0, at: { wide: [150, 80], tall: [48, 64] } },
  { id: "s1", kind: "source", beat: 1, delay: 0, at: { wide: [150, 160], tall: [134, 64] } },
  { id: "s2", kind: "source", beat: 2, delay: 0, at: { wide: [150, 240], tall: [220, 64] } },
  { id: "s3", kind: "source", beat: 3, delay: 0, at: { wide: [150, 320], tall: [306, 64] } },
  { id: "upi", kind: "hub", beat: 0, delay: 450, at: { wide: [272, 134], tall: [62, 214] } },
  { id: "pay", kind: "hub", beat: 0, delay: 600, at: { wide: [272, 300], tall: [62, 392] } },
  { id: "f24", kind: "fact", beat: 0, delay: 900, replaced: [1, 1150], at: { wide: [380, 190], tall: [176, 270] } },
  { id: "fraz", kind: "fact", beat: 0, delay: 1150, replaced: [3, 1150], at: { wide: [380, 328], tall: [176, 420] } },
  { id: "f25", kind: "fact", beat: 1, delay: 900, replaced: [2, 1150], at: { wide: [380, 134], tall: [176, 214] } },
  { id: "f28", kind: "fact", beat: 2, delay: 900, at: { wide: [380, 78], tall: [176, 158] } },
  { id: "agent", kind: "agent", beat: 2, delay: 2100, at: { wide: [482, 100], tall: [26, 508] } },
  { id: "draft", kind: "draft", beat: 2, delay: 2850, at: { wide: [482, 180], tall: [194, 508] } },
  { id: "fpayu", kind: "fact", beat: 3, delay: 900, at: { wide: [380, 272], tall: [176, 364] } },
  { id: "ask", kind: "ask", beat: LAST_BEAT, delay: 0, at: { wide: [482, 278], tall: [20, 556] } },
];

export const NODE: Record<NodeId, BrainNode> = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<NodeId, BrainNode>;

export type BrainEdge = { a: NodeId; b: NodeId; kind: "about" | "supersedes"; beat: number; delay: number };

export const EDGES: BrainEdge[] = [
  { a: "upi", b: "f24", kind: "about", beat: 0, delay: 900 },
  { a: "pay", b: "fraz", kind: "about", beat: 0, delay: 1150 },
  { a: "upi", b: "f25", kind: "about", beat: 1, delay: 900 },
  { a: "f25", b: "f24", kind: "supersedes", beat: 1, delay: 1150 },
  { a: "upi", b: "f28", kind: "about", beat: 2, delay: 900 },
  { a: "f28", b: "f25", kind: "supersedes", beat: 2, delay: 1150 },
  { a: "pay", b: "fpayu", kind: "about", beat: 3, delay: 900 },
  { a: "fpayu", b: "fraz", kind: "supersedes", beat: 3, delay: 1150 },
];

export const edgeKey = (e: BrainEdge) => `${e.a}>${e.b}`;

/** On the last beat a question reaches the current fact at `at`; the answer and its chain light up from `reveal`. */
export const ANSWER = { at: 1150, reveal: 1950, edges: ["upi>f28", "f28>f25", "f25>f24"] };

/** "write" is new information arriving; "read" is an agent or a question using the memory. */
export type Tone = "write" | "read";
export type PulseSpec = { from: NodeId; to: NodeId; at: number; dur: number; tone: Tone; direct?: boolean };

export const PULSES: PulseSpec[][] = [
  [
    { from: "s0", to: "f24", at: 200, dur: 700, tone: "write" },
    { from: "s0", to: "fraz", at: 450, dur: 700, tone: "write" },
  ],
  [{ from: "s1", to: "f25", at: 200, dur: 700, tone: "write" }],
  [
    { from: "s2", to: "f28", at: 200, dur: 700, tone: "write" },
    { from: "f28", to: "agent", at: 1500, dur: 600, tone: "read", direct: true },
    { from: "agent", to: "draft", at: 2250, dur: 600, tone: "read", direct: true },
  ],
  [{ from: "s3", to: "fpayu", at: 200, dur: 700, tone: "write" }],
  [
    { from: "ask", to: "f28", at: 350, dur: 800, tone: "read" },
    { from: "f28", to: "s2", at: 1250, dur: 700, tone: "read" },
  ],
];

export function isShown(n: { beat: number; delay: number }, beat: number, t: number) {
  return beat > n.beat || (beat === n.beat && t >= n.delay);
}

export function isReplaced(n: BrainNode, beat: number, t: number) {
  return Boolean(n.replaced && (beat > n.replaced[0] || (beat === n.replaced[0] && t >= n.replaced[1])));
}

export type Mesh = {
  /** Neurons first, then one vertex per labelled node, in NODES order. */
  pts: { x: number; y: number; phase: number }[];
  neurons: number;
  anchor: Record<NodeId, number>;
  adj: number[][];
  links: [number, number][];
};

/** Small seeded PRNG (mulberry32), so the mesh is the same on every visit. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REGION: Record<LayoutKey, { cx: number; cy: number; rx: number; ry: number; count: number; gap: number; seed: number }> = {
  wide: { cx: 318, cy: 212, rx: 182, ry: 200, count: 96, gap: 23, seed: 11 },
  tall: { cx: 180, cy: 300, rx: 172, ry: 210, count: 84, gap: 22, seed: 23 },
};

/** An organic cloud of neurons, each joined to its nearest neighbours; labelled nodes plug into the cloud. */
export function buildMesh(layout: LayoutKey): Mesh {
  const { w, h } = BOX[layout];
  const r = REGION[layout];
  const rand = rng(r.seed);
  // Labels have their own backgrounds, so the cloud stays whole; it only keeps clear of each labelled dot.
  const anchors = NODES.map((n) => n.at[layout]);
  const blocked = (x: number, y: number) => anchors.some(([ax, ay]) => (ax - x) ** 2 + (ay - y) ** 2 < 18 * 18);

  const pts: Mesh["pts"] = [];
  for (let tries = 0; pts.length < r.count && tries < 8000; tries++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * (1 + 0.08 * Math.sin(3 * a + 0.6) + 0.05 * Math.sin(5 * a + 2.1));
    const x = r.cx + Math.cos(a) * r.rx * d;
    const y = r.cy + Math.sin(a) * r.ry * d;
    if (x < 8 || y < 8 || x > w - 8 || y > h - 8 || blocked(x, y)) continue;
    if (pts.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < r.gap * r.gap)) continue;
    pts.push({ x, y, phase: rand() * Math.PI * 2 });
  }

  const neurons = pts.length;
  const anchor = {} as Record<NodeId, number>;
  for (const n of NODES) {
    anchor[n.id] = pts.length;
    pts.push({ x: n.at[layout][0], y: n.at[layout][1], phase: 0 });
  }

  const adj: number[][] = pts.map(() => []);
  const links: [number, number][] = [];
  const join = (i: number, j: number) => {
    if (adj[i].includes(j)) return;
    adj[i].push(j);
    adj[j].push(i);
    links.push([i, j]);
  };
  const nearest = (i: number, k: number, max: number) => {
    const out: [number, number][] = [];
    for (let j = 0; j < neurons; j++) {
      if (j === i) continue;
      const d = Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
      if (d < max) out.push([j, d]);
    }
    return out.sort((a, b) => a[1] - b[1]).slice(0, k);
  };
  for (let i = 0; i < neurons; i++) for (const [j] of nearest(i, 3, 80)) join(i, j);
  // Agents sit outside the brain and are reached directly, so they don't plug into the cloud.
  NODES.forEach((n, k) => {
    if (n.kind === "agent" || n.kind === "draft") return;
    for (const [j] of nearest(neurons + k, 3, 120)) join(neurons + k, j);
  });

  return { pts, neurons, anchor, adj, links };
}

/** Shortest path between two labelled nodes that passes only through neurons. */
export function route(mesh: Mesh, from: NodeId, to: NodeId): number[] {
  const start = mesh.anchor[from];
  const goal = mesh.anchor[to];
  const n = mesh.pts.length;
  const dist = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  dist[start] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === goal) break;
    done[u] = true;
    if (u !== start && u >= mesh.neurons) continue;
    for (const v of mesh.adj[u]) {
      const d = dist[u] + Math.hypot(mesh.pts[v].x - mesh.pts[u].x, mesh.pts[v].y - mesh.pts[u].y);
      if (d < dist[v]) {
        dist[v] = d;
        prev[v] = u;
      }
    }
  }
  if (prev[goal] < 0) return [start, goal];
  const path = [goal];
  while (path[0] !== start) path.unshift(prev[path[0]]);
  return path;
}
