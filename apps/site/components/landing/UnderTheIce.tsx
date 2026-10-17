const FEATURES: [string, string][] = [
  ["A database per team, with RBAC", "Each team gets its own Neo4j database. A reader from one team is refused by the server on another team's database."],
  ["Change Data Capture", "Agents wake from committed changes, carrying the transaction id. A write from Neo4j Browser or an MCP client wakes them too."],
  ["Write locks on SET", "Task claims are compare-and-set under the node's lock, so exactly one agent wins."],
  ["Range indexes on validity", "valid_from and valid_to answer what the team believed on any date, in milliseconds."],
  ["Variable-length paths", "SUPERSEDES*1..10 walks a decision's history in both directions for the Why panel."],
  ["Vector and full-text indexes", "768-dimension HNSW vectors and Lucene keyword search, fused by reciprocal rank."],
  ["Graph Data Science", "PageRank ranks the routines agents learn; WCC groups entities that belong together."],
];

const MEASURED: [string, string][] = [
  ["Mixed read and write load, 20 agents across 4 tenants", "954 ops/s"],
  ["Read latency at the median", "18 ms"],
  ["Read latency at p99", "43 ms"],
  ["Concurrent claims on one task", "1 winner, every run"],
  ["Fact change to agent reaction", "under 1 s"],
  ["Tests against live Neo4j Enterprise", "47"],
];

type SchemaNode = { id: string; x: number; y: number; w: number; tone?: "fact" | "work" };

const NODES: SchemaNode[] = [
  { id: "Meeting", x: 92, y: 70, w: 112 },
  { id: "EmailThread", x: 92, y: 210, w: 128 },
  { id: "Episode", x: 318, y: 140, w: 104 },
  { id: "Fact", x: 540, y: 140, w: 96, tone: "fact" },
  { id: "Entity", x: 700, y: 60, w: 96 },
  { id: "Person", x: 540, y: 280, w: 104 },
  { id: "WorkItem", x: 318, y: 360, w: 116, tone: "work" },
  { id: "Task", x: 700, y: 250, w: 88 },
  { id: "Agent", x: 700, y: 370, w: 96 },
];

const EDGES: [string, string, string][] = [
  ["Meeting", "Episode", "HAS_EPISODE"],
  ["EmailThread", "Episode", "HAS_EPISODE"],
  ["Fact", "Episode", "DERIVED_FROM"],
  ["Fact", "Entity", "ABOUT"],
  ["Fact", "Person", "STATED_BY"],
  ["WorkItem", "Fact", "DEPENDS_ON"],
  ["WorkItem", "Person", "OWNED_BY"],
  ["Task", "Fact", "ABOUT"],
  ["Task", "Agent", "CLAIMED_BY"],
];

const H = 38;

/** Where the segment from a node's centre towards (tx, ty) leaves its rectangle. */
function clip(n: SchemaNode, tx: number, ty: number) {
  const dx = tx - n.x;
  const dy = ty - n.y;
  const sx = dx === 0 ? Infinity : n.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : H / 2 / Math.abs(dy);
  const k = Math.min(sx, sy);
  return [n.x + dx * k, n.y + dy * k];
}

/** The graph model, drawn from the labels and relationships in cypher/. */
function Schema() {
  const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
  return (
    <svg
      viewBox="0 0 780 420"
      className="h-auto w-full"
      role="img"
      aria-label="Helium's graph model. Meetings and email threads have episodes. Facts are derived from episodes, are about entities, are stated by people, and supersede older facts. Work items depend on facts and are owned by people. Tasks are about facts and are claimed by agents."
    >
      <defs>
        <marker id="schema-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" fill="rgb(148 176 214 / 0.75)" />
        </marker>
        <marker id="schema-arrow-he" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" fill="#ffae8a" />
        </marker>
      </defs>
      {EDGES.map(([a, b, label]) => {
        const from = byId[a];
        const to = byId[b];
        const [x1, y1] = clip(from, to.x, to.y);
        const [x2, y2] = clip(to, from.x, from.y);
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        return (
          <g key={`${a}-${b}`}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgb(148 176 214 / 0.42)" strokeWidth={1.2} markerEnd="url(#schema-arrow)" />
            <text
              x={mx}
              y={my - 6}
              textAnchor="middle"
              fontSize={12.5}
              fill="#8593aa"
              stroke="#080d16"
              strokeWidth={4}
              paintOrder="stroke"
              style={{ fontFamily: "var(--font-jetbrains)" }}
            >
              {label}
            </text>
          </g>
        );
      })}
      <path d="M560 122 C 610 54, 470 54, 520 122" fill="none" stroke="#ffae8a" strokeWidth={1.4} markerEnd="url(#schema-arrow-he)" />
      <text x={540} y={46} textAnchor="middle" fontSize={12.5} fill="#ffae8a" style={{ fontFamily: "var(--font-jetbrains)" }}>
        SUPERSEDES*1..10
      </text>
      {NODES.map((n) => (
        <g key={n.id} transform={`translate(${n.x} ${n.y})`}>
          <rect
            x={-n.w / 2}
            y={-H / 2}
            width={n.w}
            height={H}
            rx={3}
            fill={n.tone === "fact" ? "#ffae8a" : "#121a28"}
            stroke={n.tone === "fact" ? "#ffae8a" : n.tone === "work" ? "#ff6b8b" : "rgb(148 176 214 / 0.45)"}
          />
          <text
            x={0}
            y={5.5}
            textAnchor="middle"
            fontSize={15.5}
            fontWeight={650}
            fill={n.tone === "fact" ? "#2a1208" : "#eef3f9"}
            style={{ fontVariationSettings: '"wdth" 92' }}
          >
            {n.id}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function UnderTheIce() {
  return (
    <div className="space-y-16">
      <div className="grid gap-10 lg:grid-cols-[1.45fr_1fr] lg:items-center">
        <div className="rounded-[3px] border rule bg-g-900/60 p-4 sm:p-6">
          <Schema />
        </div>
        <div>
          <h3 className="t-h3 text-frost">Two clocks, like real ice.</h3>
          <p className="mt-4 max-w-[34rem] text-rime">
            In an ice core, the air trapped in a bubble is younger than the ice around it, so scientists keep two chronologies. Helium keeps two clocks for the same
            reason: when a fact was true, and when the team learned it. A late import slots into the right layer without changing what was believed at the time.
          </p>
          <p className="mt-4 max-w-[34rem] text-slate">
            Every node above lives in the team&apos;s own database. The Why panel shows the Cypher for each answer, so anyone can read what ran.
          </p>
        </div>
      </div>

      <div className="grid gap-12 lg:grid-cols-2">
        <div>
          <h3 className="t-h3 text-frost">What Neo4j does here</h3>
          <dl className="mt-6 border-t rule">
            {FEATURES.map(([k, v]) => (
              <div key={k} className="grid gap-1 border-b rule py-4 sm:grid-cols-[13rem_1fr] sm:gap-6">
                <dt className="font-semibold text-frost">{k}</dt>
                <dd className="text-[0.96rem] text-rime">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h3 className="t-h3 text-frost">Measured on one laptop</h3>
          <table className="mt-6 w-full border-t rule text-left">
            <caption className="sr-only">Benchmark results from the Helium repository</caption>
            <tbody>
              {MEASURED.map(([k, v]) => (
                <tr key={k} className="border-b rule">
                  <th scope="row" className="py-4 pr-6 text-[0.96rem] font-normal text-rime">
                    {k}
                  </th>
                  <td className="t-num whitespace-nowrap py-4 text-right text-[1.15rem] font-semibold text-frost" style={{ fontVariationSettings: '"wdth" 104' }}>
                    {v}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-[0.88rem] text-slate">
            From the benchmark harness and test suite in the repository. The claim race above is a simulation of the measured result.
          </p>
        </div>
      </div>
    </div>
  );
}
