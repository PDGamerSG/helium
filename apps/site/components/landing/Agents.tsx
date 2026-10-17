"use client";

import { useEffect, useRef, useState } from "react";
import { IconAgent, IconBolt, IconMail, IconPencil, IconRefresh } from "@/components/icons";
import { useInView, useReducedMotion } from "@/lib/hooks";

type Step = { at: string; who: string; what: string; detail: string; icon: "change" | "agent" | "draft" | "impact" };

const STEPS: Step[] = [
  {
    at: "14:02:00.00",
    who: "Neo4j",
    what: "UPI flow due 25 Sep is superseded by 28 Sep",
    detail: "Priya's email commits. The change log records the transaction.",
    icon: "change",
  },
  {
    at: "+0.31 s",
    who: "Tempo",
    what: "Wakes from Change Data Capture",
    detail: "Its selector matches a superseded commitment. No polling, no message bus.",
    icon: "agent",
  },
  {
    at: "+0.46 s",
    who: "Tempo",
    what: "Claims the reschedule task, version 1 to 2",
    detail: "Compare-and-set under the node's write lock. A second claimant gets no row.",
    icon: "agent",
  },
  {
    at: "+0.72 s",
    who: "Tempo",
    what: "Finds Rahul's release handoff still says 24 Sep",
    detail: "The work item depends on the old fact, so it needs review.",
    icon: "impact",
  },
  { at: "+0.95 s", who: "Relay", what: "Receives the hand-off", detail: "Context travels as graph pointers: two facts and one owner.", icon: "agent" },
  { at: "+1.40 s", who: "Relay", what: "Saves a note to Rahul", detail: "It stays a local draft until a person sends it.", icon: "draft" },
];

const ICONS = { change: IconBolt, agent: IconAgent, draft: IconPencil, impact: IconMail };

export function AgentTrace() {
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box);
  const reduced = useReducedMotion();
  // The trace is always legible; a highlight passes down it once, step by step, when it comes into view.
  const [lit, setLit] = useState(-1);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!inView || reduced) return;
    let i = -1;
    const timer = window.setInterval(() => {
      i += 1;
      setLit(i < STEPS.length ? i : -1);
      if (i >= STEPS.length) window.clearInterval(timer);
    }, 700);
    return () => window.clearInterval(timer);
  }, [inView, reduced, run]);

  return (
    <div ref={box} className="relative">
      <ol className="relative space-y-0" aria-label="What happens after the change">
        <span aria-hidden className="absolute bottom-6 left-[1.05rem] top-6 w-px bg-[rgb(148_176_214/0.18)]" />
        {STEPS.map((s, i) => {
          const Icon = ICONS[s.icon];
          const on = i === lit;
          return (
            <li
              key={s.at}
              aria-current={on ? "step" : undefined}
              className={`relative -mx-3 grid grid-cols-[2.1rem_1fr] gap-4 rounded-[3px] px-3 py-3.5 transition-[background-color,box-shadow] duration-500 ${
                on ? "bg-[rgb(255_174_138/0.07)] shadow-[inset_0_0_0_1px_rgb(255_174_138/0.25)]" : ""
              }`}
            >
              <span
                className={`relative z-10 mt-0.5 grid h-[2.1rem] w-[2.1rem] place-items-center rounded-full border ${
                  s.icon === "draft"
                    ? "border-dashed border-rime text-rime"
                    : s.icon === "change"
                      ? "border-he bg-he text-he-ink"
                      : s.icon === "impact"
                        ? "border-flag text-flag"
                        : "border-[rgb(148_176_214/0.4)] bg-g-800 text-frost"
                }`}
              >
                <Icon size={16} />
              </span>
              <div>
                <p className="flex flex-wrap items-baseline gap-x-3 text-[0.86rem]">
                  <span className="t-num font-semibold text-rime" style={{ fontVariationSettings: '"wdth" 88' }}>
                    {s.at}
                  </span>
                  <span className="text-slate">{s.who}</span>
                </p>
                <p className="mt-0.5 font-semibold text-frost">{s.what}</p>
                <p className="mt-0.5 text-[0.95rem] text-slate">{s.detail}</p>
                {s.icon === "draft" ? (
                  <p className="mt-2">
                    <span className="mark-draft text-[0.86rem]">
                      <IconPencil size={14} /> Unsent draft
                    </span>
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="button"
          className="btn btn-line btn-sm"
          onClick={() => {
            setLit(-1);
            setRun((n) => n + 1);
          }}
          disabled={reduced}
        >
          <IconRefresh size={15} /> Replay
        </button>
        <p className="text-[0.86rem] text-slate">Timings are illustrative. Measured, a fact change reaches its agent in under a second.</p>
      </div>
    </div>
  );
}

type Racer = { id: number; state: "idle" | "trying" | "won" | "lost" };

export function ClaimRace({ cypher }: { cypher: string }) {
  const reduced = useReducedMotion();
  // At rest the grid shows the measured outcome; the button replays it.
  const [racers, setRacers] = useState<Racer[]>(() => Array.from({ length: 25 }, (_, id) => ({ id, state: id === 6 ? "won" : "lost" })));
  const [runs, setRuns] = useState(0);
  const [busy, setBusy] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const race = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    const winner = Math.floor(Math.random() * 25);
    setBusy(true);
    setRacers((r) => r.map((x) => ({ ...x, state: "trying" })));
    const settle = () => {
      setRacers((r) => r.map((x) => ({ ...x, state: x.id === winner ? "won" : "lost" })));
      setRuns((n) => n + 1);
      setBusy(false);
    };
    if (reduced) settle();
    else timers.current.push(window.setTimeout(settle, 900));
  };

  const done = racers.some((r) => r.state === "won");
  const winner = racers.find((r) => r.state === "won");

  return (
    <div>
      <div
        className="grid max-w-[22rem] grid-cols-5 gap-1.5"
        role="img"
        aria-label={
          done
            ? `Twenty-five agents claimed one task. Agent ${String((winner?.id ?? 0) + 1).padStart(2, "0")} won; the other 24 got no row.`
            : "Twenty-five agents waiting to claim one task."
        }
      >
        {racers.map((r) => (
          <div
            key={r.id}
            className={`t-num relative grid aspect-square place-items-center rounded-[2px] text-[0.78rem] font-semibold transition-[background-color,color,border-color,transform] duration-300 ${
              r.state === "won"
                ? "scale-[1.04] bg-he text-he-ink"
                : r.state === "lost"
                  ? "border border-[rgb(148_176_214/0.18)] text-ash line-through"
                  : r.state === "trying"
                    ? "animate-pulse border border-[rgb(148_176_214/0.45)] text-frost"
                    : "border border-[rgb(148_176_214/0.22)] text-slate"
            }`}
            style={{ transitionDelay: r.state === "trying" ? `${(r.id * 37) % 300}ms` : "0ms" }}
          >
            {String(r.id + 1).padStart(2, "0")}
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button type="button" onClick={race} disabled={busy} className="btn btn-he btn-sm">
          {runs ? "Race again" : "Replay the race"}
        </button>
        <p aria-live="polite" className="text-[0.95rem] text-rime">
          {done ? (
            <>
              <span className="font-semibold text-frost">1 winner.</span> 24 claims returned no row.
              {runs > 1 ? ` Same result, replay ${runs}.` : runs === 0 ? " The result of every benchmark run." : ""}
            </>
          ) : busy ? (
            "25 agents claim at version 3…"
          ) : (
            "One open task, 25 agents."
          )}
        </p>
      </div>
      <details className="group mt-5 rounded-[3px] border rule">
        <summary className="cursor-pointer list-none px-4 py-3 text-[0.92rem] font-semibold text-rime transition-colors hover:text-frost [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Show the claim query</span>
          <span className="hidden group-open:inline">Hide the claim query</span>
        </summary>
        <pre className="code max-h-72 overflow-auto border-t rule px-4 py-4 text-rime">
          <code>{cypher}</code>
        </pre>
      </details>
    </div>
  );
}
