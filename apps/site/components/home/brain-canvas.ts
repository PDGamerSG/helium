import { ANSWER, BOX, EDGES, LAST_BEAT, NODE, NODES, PULSES, buildMesh, edgeKey, isReplaced, isShown, route, type LayoutKey, type Mesh, type NodeId, type Tone } from "./brain-graph";

/**
 * Canvas layer of the company-brain demo: a drifting cloud of neurons that fire at random, the graph's edges,
 * and the signals that carry each new fact in and each question or agent read out. Labels are HTML on top.
 */

/** Graphite for structure and reads; one signal orange for new information. */
const INK = "14 14 16";
const COLOR: Record<Tone | "idle", string> = { write: "255 90 31", read: "14 14 16", idle: "255 90 31" };
const rgba = (c: string, a: number) => `rgb(${c} / ${a})`;
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

type Pulse = { path: number[]; start: number; dur: number; tone: Tone | "idle"; passed: number; hops: number };
type Ripple = { x: number; y: number; start: number; tone: Tone };

export function createBrain(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  let layout: LayoutKey = "wide";
  let mesh: Mesh = buildMesh(layout);
  let routes = new Map<string, number[]>();
  let flash = new Float32Array(mesh.neurons);
  let flashTone = new Uint8Array(mesh.neurons);
  let pulses: Pulse[] = [];
  let ripples: Ripple[] = [];
  let beat = -1;
  let beatStart = 0;
  let spawned = new Set<number>();
  let scale = 1;
  let dpr = 1;
  let nextIdle = 0;
  let last = 0;

  function setLayout(next: LayoutKey) {
    if (next === layout) return;
    layout = next;
    mesh = buildMesh(layout);
    routes = new Map();
    flash = new Float32Array(mesh.neurons);
    flashTone = new Uint8Array(mesh.neurons);
    pulses = [];
    ripples = [];
  }

  function resize(width: number, height: number, ratio: number) {
    dpr = ratio;
    scale = width / BOX[layout].w;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
  }

  function setBeat(next: number, now: number) {
    beat = next;
    beatStart = now;
    spawned = new Set();
    pulses = pulses.filter((p) => p.tone === "idle");
  }

  function pathFor(from: NodeId, to: NodeId) {
    const key = `${from}>${to}`;
    let path = routes.get(key);
    if (!path) {
      path = route(mesh, from, to);
      routes.set(key, path);
    }
    return path;
  }

  function spark(i: number, amount: number, tone: Tone | "idle") {
    if (i >= mesh.neurons) return;
    if (amount >= flash[i]) flashTone[i] = tone === "read" ? 1 : 0;
    flash[i] = Math.max(flash[i], amount);
  }

  function fireIdle(now: number) {
    if (pulses.filter((p) => p.tone === "idle").length >= 9) return;
    const i = Math.floor(Math.random() * mesh.neurons);
    const next = mesh.adj[i].filter((j) => j < mesh.neurons);
    if (!next.length) return;
    spark(i, 0.35, "idle");
    pulses.push({ path: [i, next[Math.floor(Math.random() * next.length)]], start: now, dur: 520 + Math.random() * 480, tone: "idle", passed: 0, hops: 0 });
  }

  function frame(now: number, animate: boolean) {
    if (!ctx) return;
    const dt = last ? Math.min(64, now - last) : 16;
    last = now;
    const t = animate ? now - beatStart : Infinity;
    const { w, h } = BOX[layout];
    const px = 1 / scale;

    const at = (i: number): [number, number] => {
      const p = mesh.pts[i];
      if (!animate || i >= mesh.neurons) return [p.x, p.y];
      return [p.x + Math.sin(now * 0.0007 + p.phase) * 2.2, p.y + Math.cos(now * 0.00055 + p.phase * 1.7) * 2.2];
    };
    const anchorShown = (v: number) => isShown(NODES[v - mesh.neurons], beat, t);

    if (animate && beat >= 0) {
      PULSES[beat].forEach((spec, i) => {
        if (spawned.has(i) || t < spec.at) return;
        spawned.add(i);
        const path = spec.direct ? [mesh.anchor[spec.from], mesh.anchor[spec.to]] : pathFor(spec.from, spec.to);
        pulses.push({ path, start: beatStart + spec.at, dur: spec.dur, tone: spec.tone, passed: 0, hops: 0 });
      });
    }
    if (animate && now >= nextIdle) {
      fireIdle(now);
      nextIdle = now + 220 + Math.random() * 380;
    }

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = "round";

    // The cloud's wiring, plus the links into each labelled node once it exists.
    ctx.lineWidth = px;
    ctx.strokeStyle = rgba(INK, 0.065);
    ctx.beginPath();
    for (const [i, j] of mesh.links) {
      if (j >= mesh.neurons && !anchorShown(j)) continue;
      const [x1, y1] = at(i);
      const [x2, y2] = at(j);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();

    // Graph edges: a fact is ABOUT its topic; a newer fact SUPERSEDES the older one, drawn as a dashed arc.
    const answered = beat === LAST_BEAT && t >= ANSWER.at;
    for (const e of EDGES) {
      const p = beat > e.beat ? 1 : beat === e.beat ? clamp((t - e.delay) / 420) : 0;
      if (p <= 0) continue;
      const [ax, ay] = NODE[e.a].at[layout];
      const [bx, by] = NODE[e.b].at[layout];
      const hot = answered && ANSWER.edges.includes(edgeKey(e));
      ctx.beginPath();
      if (e.kind === "about") {
        const old = isReplaced(NODE[e.b], beat, t);
        ctx.setLineDash(old && !hot ? [3 * px, 3.5 * px] : []);
        ctx.strokeStyle = hot ? rgba(INK, 0.9) : rgba(INK, old ? 0.18 : 0.38);
        ctx.lineWidth = (hot ? 2 : 1.25) * px;
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + (bx - ax) * p, ay + (by - ay) * p);
      } else {
        const cx = Math.min(ax, bx) - 26;
        const cy = (ay + by) / 2;
        // Split the quadratic at p so the arc draws itself from the newer fact to the older one.
        const q1x = ax + (cx - ax) * p;
        const q1y = ay + (cy - ay) * p;
        const q2x = q1x + (cx + (bx - cx) * p - q1x) * p;
        const q2y = q1y + (cy + (by - cy) * p - q1y) * p;
        ctx.setLineDash([4 * px, 3 * px]);
        ctx.strokeStyle = hot ? rgba(INK, 0.9) : rgba(INK, 0.42);
        ctx.lineWidth = (hot ? 2 : 1.4) * px;
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(q1x, q1y, q2x, q2y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Signals.
    const alive: Pulse[] = [];
    for (const pl of pulses) {
      const k = clamp((now - pl.start) / pl.dur);
      if (k <= 0) {
        alive.push(pl);
        continue;
      }
      const pts = pl.path.map(at);
      const seg: number[] = [];
      let total = 0;
      for (let i = 1; i < pts.length; i++) {
        const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        seg.push(d);
        total += d;
      }
      const along = (f: number): [number, number] => {
        let d = Math.max(0, f) * total;
        for (let i = 0; i < seg.length; i++) {
          if (d <= seg[i] || i === seg.length - 1) {
            const r = seg[i] ? Math.min(1, d / seg[i]) : 1;
            return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * r, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * r];
          }
          d -= seg[i];
        }
        return pts[pts.length - 1];
      };
      const e = pl.tone === "idle" ? k : ease(k);
      const strong = pl.tone !== "idle";
      const c = COLOR[pl.tone];

      // Light each neuron as the signal passes it.
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        acc += seg[i - 1];
        if (i <= pl.passed) continue;
        if (total && acc / total > e) break;
        spark(pl.path[i], strong ? 1 : 0.55, pl.tone);
        pl.passed = i;
      }

      const trail = strong ? 0.2 : 0.35;
      for (let s = 8; s >= 1; s--) {
        const [x0, y0] = along(e - (trail * s) / 8);
        const [x1, y1] = along(e - (trail * (s - 1)) / 8);
        ctx.strokeStyle = rgba(c, (strong ? 0.8 : 0.4) * (1 - s / 9));
        ctx.lineWidth = (strong ? 2.6 : 1.4) * px * (1 - (s - 1) / 14);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      const [hx, hy] = along(e);
      // New information glows; a read is a crisp ink dot on a white ring, since a dark glow reads as a smudge.
      if (pl.tone === "write") {
        ctx.shadowColor = rgba(c, 0.85);
        ctx.shadowBlur = 12 * dpr;
      } else if (pl.tone === "read") {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(hx, hy, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = rgba(c, strong ? 1 : 0.55);
      ctx.beginPath();
      ctx.arc(hx, hy, strong ? 3.4 : 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (k < 1) {
        alive.push(pl);
        continue;
      }
      const end = pl.path[pl.path.length - 1];
      if (strong) {
        const [x, y] = pts[pts.length - 1];
        ripples.push({ x, y, start: now, tone: pl.tone as Tone });
      } else if (pl.hops < 4 && Math.random() < 0.5) {
        // Synapses relay: the neuron that received the signal sometimes passes it on.
        const prev = pl.path[0];
        const next = mesh.adj[end].filter((j) => j < mesh.neurons && j !== prev);
        if (next.length) alive.push({ path: [end, next[Math.floor(Math.random() * next.length)]], start: now, dur: 520 + Math.random() * 480, tone: "idle", passed: 0, hops: pl.hops + 1 });
      }
    }
    pulses = alive;

    ripples = ripples.filter((r) => now - r.start < 800);
    for (const r of ripples) {
      const k = (now - r.start) / 800;
      ctx.strokeStyle = rgba(COLOR[r.tone], 0.55 * (1 - k));
      ctx.lineWidth = 1.5 * px;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 5 + 20 * ease(k), 0, Math.PI * 2);
      ctx.stroke();
    }

    // Neurons last, so a firing one sits on top of its wiring.
    const decay = animate ? Math.exp(-dt / 420) : 0;
    for (let i = 0; i < mesh.neurons; i++) {
      flash[i] *= decay;
      const [x, y] = at(i);
      ctx.fillStyle = rgba(INK, 0.2);
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
      const f = flash[i];
      if (f > 0.03) {
        ctx.fillStyle = rgba(flashTone[i] ? COLOR.read : COLOR.write, (flashTone[i] ? 0.7 : 0.9) * f);
        ctx.beginPath();
        ctx.arc(x, y, 1.8 + 2.2 * f, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  return { setLayout, resize, setBeat, frame };
}
