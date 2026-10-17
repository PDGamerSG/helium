"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { IconAgent, IconMail, IconMic, IconPause, IconPencil, IconPlay, IconSearch } from "@/components/icons";
import { useInView, useReducedMotion } from "@/lib/hooks";
import { createBrain } from "./brain-canvas";
import { ANSWER, BEAT_MS, BOX, LAST_BEAT, NODES, REST_MS, type BrainNode, type LayoutKey, type NodeId } from "./brain-graph";

export type BrainFact = { value: string; who: string; date: string; until?: string };
export type BrainSource = { title: string; date: string; kind: "meeting" | "email" };
/** Real Orbit values: four sources in order, the UPI due-date chain (24, 25, 28 Sep) and the vendor chain (Razorpay, PayU). */
export type BrainStory = { sources: BrainSource[]; upi: BrainFact[]; pay: BrainFact[] };

const WIDE = "(min-width: 640px)";

function subscribeWide(callback: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function useLayout(): LayoutKey {
  return useSyncExternalStore(
    subscribeWide,
    () => (window.matchMedia(WIDE).matches ? "wide" : "tall"),
    () => "wide",
  );
}

function steps(story: BrainStory) {
  const [kick, stand, mail, call] = story.sources;
  const [u24, u25, u28] = story.upi;
  const [raz, payu] = story.pay;
  return [
    { date: kick.date, label: "Kickoff", caption: `${u24.who} commits the UPI flow to ${u24.value}. The team picks ${raz.value}.` },
    { date: stand.date, label: "Standup", caption: `The date slips to ${u25.value}. ${u24.value} stays on record, with an end date.` },
    { date: mail.date, label: "Email", caption: `${u28.who} emails: ${u28.value}. An agent wakes and drafts a note to Rahul.` },
    { date: call.date, label: "Client call", caption: `${payu.value} replaces ${raz.value}. Both stay on record.` },
    { date: "Now", label: "Ask", caption: "Ask anything. The answer shows who said it, and when." },
  ];
}

/**
 * The hero: a company brain building itself from Orbit's September. Sources arrive, signals cross the neuron cloud,
 * facts appear, newer facts supersede older ones without deleting them, an agent wakes, and a question reads it all back.
 */
export function BrainDemo({ story }: { story: BrainStory }) {
  const layout = useLayout();
  const reduced = useReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const brain = useRef<ReturnType<typeof createBrain> | null>(null);
  const clock = useRef({ beat: -2, elapsed: 0 });
  const inView = useInView(stage);
  const [beat, setBeat] = useState(-1);
  const [playing, setPlaying] = useState(true);
  const [run, setRun] = useState(0);
  const [scale, setScale] = useState(1);

  // Reduced motion shows the finished memory; the steps still switch between days.
  const shown = reduced && beat < 0 ? LAST_BEAT : beat;
  const auto = playing && !reduced && inView;
  const list = steps(story);

  // Advance while playing and on screen. Time already spent on a beat survives a pause.
  useEffect(() => {
    if (!auto) return;
    if (clock.current.beat !== beat) clock.current = { beat, elapsed: 0 };
    const total = beat < 0 ? REST_MS : BEAT_MS[beat];
    const started = performance.now();
    const id = window.setTimeout(() => setBeat((b) => (b >= LAST_BEAT ? -1 : b + 1)), Math.max(0, total - clock.current.elapsed));
    return () => {
      window.clearTimeout(id);
      if (clock.current.beat === beat) clock.current.elapsed += performance.now() - started;
    };
  }, [auto, beat, run]);

  useEffect(() => {
    if (!canvas.current) return;
    brain.current = createBrain(canvas.current);
    return () => {
      brain.current = null;
    };
  }, []);

  useEffect(() => {
    const b = brain.current;
    const box = stage.current;
    if (!b || !box) return;
    b.setLayout(layout);
    const ro = new ResizeObserver(() => {
      b.resize(box.clientWidth, box.clientHeight, Math.min(2, window.devicePixelRatio || 1));
      setScale(box.clientWidth / BOX[layout].w);
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [layout]);

  useEffect(() => {
    brain.current?.setBeat(shown, performance.now());
  }, [shown, run, layout]);

  useEffect(() => {
    const b = brain.current;
    if (!b) return;
    if (!auto) {
      b.frame(performance.now(), false);
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      b.frame(now, true);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [auto, shown, scale, layout, run]);

  const pick = (i: number) => {
    clock.current = { beat: i, elapsed: 0 };
    setBeat(i);
    setRun((n) => n + 1);
    setPlaying(false);
  };

  const box = BOX[layout];
  const [u24, u25, u28] = story.upi;

  return (
    <div className="lp-card relative overflow-hidden">
      <div className="flex items-center gap-3 border-b lp-rule px-4 py-3">
        <span aria-hidden className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#dcdce0]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#dcdce0]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#dcdce0]" />
        </span>
        <p className="ml-1 truncate text-[0.86rem] font-semibold text-coal">
          Orbit&apos;s memory <span className="hidden font-normal text-coal-3 sm:inline">· sample team</span>
        </p>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          disabled={reduced}
          aria-label={playing && !reduced ? "Pause the demo" : "Play the demo"}
          className="ml-auto grid h-8 w-8 place-items-center rounded-full text-coal-2 transition-colors hover:bg-paper-2 hover:text-coal disabled:opacity-40"
        >
          {playing && !reduced ? <IconPause size={15} /> : <IconPlay size={15} />}
        </button>
      </div>

      <div ref={stage} className="relative aspect-[360/680] w-full overflow-hidden sm:aspect-[640/420]">
        <canvas ref={canvas} aria-hidden className="absolute inset-0 h-full w-full" />
        <div aria-hidden className="absolute left-0 top-0 origin-top-left" style={{ width: box.w, height: box.h, transform: `scale(${scale})` }}>
          {NODES.map((n) => (
            <BrainLabel key={n.id} n={n} layout={layout} beat={shown} story={story} />
          ))}
        </div>
        <p className="sr-only">
          An animated example from the Orbit sample team. At the kickoff on {story.sources[0].date}, {u24.who} commits the UPI flow to {u24.value} and the team
          picks {story.pay[0].value}. At the {story.sources[1].date} standup the date moves to {u25.value}. On {story.sources[2].date} {u28.who} emails that it moves to{" "}
          {u28.value}, and an agent drafts an unsent note to Rahul. On {story.sources[3].date} {story.pay[1].value} replaces {story.pay[0].value}. Asked when the UPI flow
          is due, Helium answers {u28.value}, citing {u28.who}&apos;s email, and keeps {u25.value} and {u24.value} on record.
        </p>
      </div>

      <div className="border-t lp-rule px-4 pb-4 pt-3.5 sm:px-5">
        <p className="min-h-[2.9em] text-[0.95rem] leading-snug text-coal sm:min-h-[1.6em]">
          {shown >= 0 ? (
            <>
              <span className="t-num mr-2 font-semibold">{list[shown].date === "Now" ? "Now." : `${list[shown].date}.`}</span>
              {list[shown].caption}
            </>
          ) : null}
        </p>
        <ol className="mt-3 grid grid-cols-5 gap-2">
          {list.map((s, i) => {
            const active = shown === i;
            return (
              <li key={s.label}>
                <button
                  type="button"
                  onClick={() => pick(i)}
                  aria-pressed={active}
                  aria-label={`${s.date}: ${s.label}`}
                  className="group block w-full rounded-[6px] pt-1 text-left"
                >
                  <span className="block h-[2px] overflow-hidden rounded-full bg-[rgb(14_14_16/0.08)]">
                    {i < shown ? <span className="block h-full w-full bg-[rgb(14_14_16/0.35)]" /> : null}
                    {active ? (
                      <span
                        key={`${i}-${run}`}
                        className="step-fill block h-full w-full bg-coal"
                        style={{ "--d": `${BEAT_MS[i]}ms`, animationPlayState: auto ? "running" : "paused" } as React.CSSProperties}
                      />
                    ) : null}
                  </span>
                  <span className={`t-num mt-2 block text-[0.72rem] ${active ? "text-coal-2" : "text-coal-3"}`}>{s.date}</span>
                  <span className={`block truncate text-[0.8rem] font-semibold transition-colors ${active ? "text-coal" : "text-coal-3 group-hover:text-coal-2"}`}>
                    {s.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

const FACT_OF: Partial<Record<NodeId, (s: BrainStory) => BrainFact>> = {
  f24: (s) => s.upi[0],
  f25: (s) => s.upi[1],
  f28: (s) => s.upi[2],
  fraz: (s) => s.pay[0],
  fpayu: (s) => s.pay[1],
};
const SOURCE_OF: Partial<Record<NodeId, number>> = { s0: 0, s1: 1, s2: 2, s3: 3 };

function BrainLabel({ n, layout, beat, story }: { n: BrainNode; layout: LayoutKey; beat: number; story: BrainStory }) {
  const [x, y] = n.at[layout];
  const on = beat >= n.beat;
  const delay = beat === n.beat ? n.delay : 0;
  const replaced = Boolean(n.replaced && beat >= n.replaced[0]);
  const swap = { transitionDelay: `${n.replaced && beat === n.replaced[0] ? n.replaced[1] : 0}ms` };
  const wide = layout === "wide";

  let body: React.ReactNode = null;
  if (n.kind === "source") {
    const s = story.sources[SOURCE_OF[n.id]!];
    const Icon = s.kind === "email" ? IconMail : IconMic;
    body = (
      <>
        <span className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-coal bg-white" />
        <span
          className={`absolute flex items-center gap-2 whitespace-nowrap rounded-[10px] border border-[rgb(14_14_16/0.1)] bg-white py-1.5 pl-1.5 pr-2.5 shadow-[0_6px_16px_-10px_rgb(14_14_16/0.3)] ${
            wide ? "right-[10px] top-0 -translate-y-1/2" : "bottom-[10px] left-0 -translate-x-1/2"
          }`}
        >
          <span className="grid h-6 w-6 place-items-center rounded-[7px] bg-paper-2 text-coal-2">
            <Icon size={14} />
          </span>
          <span className="leading-tight">
            {wide ? <span className="block text-[12px] font-semibold text-coal">{s.title}</span> : null}
            <span className={`block t-num ${wide ? "text-[11px] text-coal-2" : "text-[12px] font-semibold text-coal"}`}>{s.date}</span>
          </span>
        </span>
      </>
    );
  } else if (n.kind === "hub") {
    body = (
      <>
        <span className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-coal shadow-[0_0_0_4px_rgb(255_255_255)]" />
        <span className="absolute left-0 top-[12px] -translate-x-1/2 whitespace-nowrap rounded-full border border-[rgb(14_14_16/0.08)] bg-white px-2 py-0.5 text-[12px] font-semibold text-coal">
          {n.id === "upi" ? "UPI flow" : "Payments"}
        </span>
      </>
    );
  } else if (n.kind === "fact") {
    const f = FACT_OF[n.id]!(story);
    const hot = n.id === "f28" && beat === LAST_BEAT;
    body = (
      <>
        <span
          className={`bn-dot absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] ${
            replaced ? "border-coal-3 bg-white" : "border-signal bg-signal"
          } ${hot ? "shadow-[0_0_0_5px_rgb(14_14_16/0.12)]" : ""}`}
          style={hot ? { transitionDelay: `${ANSWER.at}ms` } : swap}
        />
        <span className="absolute left-[11px] top-0 -translate-y-1/2 whitespace-nowrap leading-tight">
          <span className="bn-val lp-tape text-[12.5px]" data-replaced={replaced} style={swap}>
            {n.id.startsWith("f2") ? `due ${f.value}` : f.value}
          </span>
          <span className="bn-swap lp-halo mt-[3px] text-[11px] text-coal-2">
            <span style={{ ...swap, opacity: replaced ? 0 : 1 }}>
              {f.who}, {f.date}
            </span>
            <span style={{ ...swap, opacity: replaced ? 1 : 0 }}>until {f.until}</span>
          </span>
        </span>
      </>
    );
  } else if (n.kind === "agent" || n.kind === "draft") {
    const agent = n.kind === "agent";
    body = (
      <>
        <span
          className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${agent ? "bg-coal" : "border-[1.5px] border-dashed border-coal-2 bg-white"}`}
        />
        <span
          className={`absolute left-[11px] top-0 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-[10px] bg-white py-1.5 pl-1.5 pr-2.5 ${
            agent ? "border border-[rgb(14_14_16/0.16)] shadow-[0_6px_16px_-10px_rgb(14_14_16/0.3)]" : "border border-dashed border-[rgb(14_14_16/0.35)]"
          }`}
        >
          <span className={`grid h-6 w-6 place-items-center rounded-[7px] ${agent ? "bg-coal text-white" : "bg-paper-2 text-coal-2"}`}>
            {agent ? <IconAgent size={14} /> : <IconPencil size={14} />}
          </span>
          <span className="leading-tight">
            <span className="block text-[12px] font-semibold text-coal">{agent ? "Scheduler agent" : "Note to Rahul"}</span>
            <span className="block text-[11px] text-coal-2">{agent ? "woke on the change" : "unsent draft"}</span>
          </span>
        </span>
      </>
    );
  } else {
    const answered = beat === LAST_BEAT;
    const [, u25, u28] = story.upi;
    const u24 = story.upi[0];
    body = (
      <span
        className={`absolute left-0 rounded-[12px] border border-[rgb(14_14_16/0.12)] bg-white p-2.5 shadow-[0_14px_30px_-16px_rgb(14_14_16/0.35)] ${
          wide ? "top-[-40px] w-[144px]" : "top-0 flex w-[320px] items-start gap-3"
        }`}
      >
        <span className={wide ? "block" : "block w-[150px] shrink-0"}>
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-coal-2">
            <IconSearch size={12} /> Ask
          </span>
          <span className="mt-1 block text-[12.5px] font-semibold leading-snug text-coal">When is the UPI flow due?</span>
        </span>
        <span className={`bn-swap ${wide ? "mt-2" : "pt-1"}`}>
          <span style={{ opacity: answered ? 1 : 0, transitionDelay: `${answered ? ANSWER.reveal : 0}ms` }}>
            <span className="lp-tape text-[12.5px]">{u28.value}</span>
            <span className="mt-1 block text-[11px] leading-snug text-coal-2">
              {u28.who}&apos;s email, {u28.date}
            </span>
            <span className="block text-[11px] leading-snug text-coal-3">
              was <span className="line-through">{u25.value}</span>, <span className="line-through">{u24.value}</span>
            </span>
          </span>
        </span>
      </span>
    );
  }

  return (
    <div className="bn absolute" data-on={on} style={{ left: x, top: y, transitionDelay: `${delay}ms` }}>
      {body}
    </div>
  );
}
