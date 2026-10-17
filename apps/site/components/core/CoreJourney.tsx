"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconArrowDown, IconMail, IconMic } from "@/components/icons";
import { clamp01, drillState, EXIT, HOLD, journeyScreens, smooth, stopScreens } from "@/lib/drill";
import { DAY, fmtDay } from "@/lib/format";
import { useInView, useReducedMotion, useWebGL } from "@/lib/hooks";
import type { CoreData, DrillStop } from "@/lib/orbit";
import type { CoreTag } from "./CoreScene";
import { StaticCore } from "./StaticCore";

const CoreScene = dynamic(() => import("./CoreScene"), { ssr: false });

type Stats = { meetings: number; threads: number; episodes: number; messages: number; facts: number; superseded: number };

type Props = { core: CoreData; stops: DrillStop[]; stats: Stats };

export function CoreJourney({ core, stops, stats }: Props) {
  const reduced = useReducedMotion();
  const webgl = useWebGL();
  const staticMode = reduced || webgl === false;
  return staticMode ? <StaticJourney core={core} stops={stops} stats={stats} /> : <LiveJourney core={core} stops={stops} stats={stats} webgl={webgl === true} />;
}

function HeroCopy({ stats, onDrill }: { stats: Stats; onDrill: () => void }) {
  const bubbles = stats.episodes + stats.messages;
  return (
    <div className="max-w-[40rem]">
      <h1 className="t-display enter">
        {["Every", "decision", "leaves", "a layer."].map((line, i) => (
          <span key={line} className={`block py-[0.05em] ${i < 3 ? "border-b border-[rgb(148_176_214/0.16)]" : ""}`}>
            {line}
          </span>
        ))}
      </h1>
      <p className="t-lede enter mt-8 max-w-[33rem]" style={{ animationDelay: "120ms" }}>
        Helium keeps what your team says in meetings and email as dated layers in a Neo4j graph. Drill to any day and read what was true, who said it, and what replaced
        it.
      </p>
      <div className="enter mt-10 flex flex-wrap items-center gap-3" style={{ animationDelay: "220ms" }}>
        <Link href="/workspace" className="btn btn-he">
          Open the workspace
        </Link>
        <button type="button" onClick={onDrill} className="btn btn-line">
          <IconArrowDown size={16} />
          Drill into September
        </button>
      </div>
      <p className="enter mt-12 hidden max-w-[30rem] text-[0.92rem] leading-relaxed text-slate sm:block" style={{ animationDelay: "320ms" }}>
        The core is the Orbit sample team: {stats.meetings} meetings and {stats.threads} email threads between 7 and 30 September. Each of its{" "}
        <span className="t-num text-rime">{bubbles}</span> bubbles is one recorded utterance or email.
      </p>
    </div>
  );
}

function StopArticle({ stop, active, flow = false }: { stop: DrillStop; active: boolean; flow?: boolean }) {
  return (
    <article
      aria-hidden={!active}
      className={flow ? "" : "absolute inset-x-0 top-1/2 transition-[opacity,transform,filter] duration-700 ease-[var(--ease-out-expo)]"}
      style={
        flow
          ? undefined
          : {
              opacity: active ? 1 : 0,
              transform: `translateY(calc(-50% + ${active ? 0 : 14}px))`,
              filter: active ? "none" : "blur(6px)",
              pointerEvents: active ? "auto" : "none",
            }
      }
    >
      {flow ? null : <p className="t-h2 t-num text-frost">{stop.date}</p>}
      <h2 className={`t-h3 max-w-[26rem] text-frost ${flow ? "" : "mt-4"}`}>{stop.title}</h2>
      <p className="mt-3 max-w-[30rem] text-[1.02rem] leading-relaxed text-rime">{stop.body}</p>
      {stop.quote ? (
        <figure className="mt-7 max-w-[31rem]">
          <blockquote className="t-quote text-[1.28rem] leading-[1.45] text-frost">“{stop.quote.text}”</blockquote>
          <figcaption className="mt-3 flex items-center gap-2 text-[0.88rem] text-slate">
            {stop.quote.where.startsWith("Email") ? <IconMail size={16} /> : <IconMic size={16} />}
            <span>
              <span className="text-rime">{stop.quote.who}</span>, {stop.quote.where}
            </span>
          </figcaption>
        </figure>
      ) : null}
      <ul className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.92rem]" aria-label="What the team believed on this date">
        {stop.marks.map((m) => (
          <li key={m.value}>
            {m.state === "current" ? (
              <span className="mark-current">
                {m.value}
                <span className="sr-only"> (in force on this date)</span>
              </span>
            ) : (
              <span className="mark-superseded">
                {m.value}
                <span className="sr-only"> (superseded)</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </article>
  );
}

function DepthRail({
  stops,
  active,
  markerRef,
  readoutRef,
  onGo,
}: {
  stops: DrillStop[];
  active: number;
  markerRef: React.RefObject<HTMLDivElement | null>;
  readoutRef: React.RefObject<HTMLSpanElement | null>;
  onGo: (i: number) => void;
}) {
  const days = 40;
  const pos = (day: number) => `${(1 - day / days) * 100}%`;
  return (
    <nav aria-label="Drill to a date" className="pointer-events-auto absolute bottom-[14vh] left-6 top-[16vh] hidden w-[5.5rem] lg:block xl:left-10">
      <div className="relative h-full">
        <div className="absolute bottom-0 left-[0.4rem] top-0 w-px bg-[rgb(148_176_214/0.22)]" />
        {Array.from({ length: days + 1 }, (_, d) => (
          <div key={d} className="absolute left-[0.4rem] h-px bg-[rgb(148_176_214/0.28)]" style={{ top: pos(d), width: d % 7 === 0 ? 10 : 5 }} />
        ))}
        <div
          ref={markerRef}
          className="absolute left-[0.4rem] h-[3px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-[1px] bg-he will-change-transform"
          style={{ top: 0 }}
          aria-hidden
        />
        <span
          ref={readoutRef}
          aria-live="off"
          className="t-num absolute -top-9 left-0 whitespace-nowrap text-[0.82rem] font-semibold text-frost"
          style={{ fontVariationSettings: '"wdth" 88' }}
        >
          16 Oct, surface
        </span>
        <span className="t-label absolute -bottom-8 left-0 whitespace-nowrap">Deepest layer</span>
        {stops.map((s, i) => (
          <button
            key={s.date}
            type="button"
            onClick={() => onGo(i)}
            aria-current={i === active ? "step" : undefined}
            className={`t-num absolute left-5 -translate-y-1/2 whitespace-nowrap rounded-[2px] px-1.5 py-0.5 text-left text-[0.8rem] transition-colors ${
              i === active ? "bg-[rgb(255_174_138/0.14)] text-he" : "text-slate hover:text-frost"
            }`}
            style={{ top: pos(s.day), fontVariationSettings: '"wdth" 88', fontWeight: 600 }}
          >
            {s.date}
          </button>
        ))}
      </div>
    </nav>
  );
}

function LiveJourney({ core, stops, stats, webgl }: Props & { webgl: boolean }) {
  const wrap = useRef<HTMLElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const drill = useRef<HTMLDivElement>(null);
  const closing = useRef<HTMLDivElement>(null);
  const cue = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const screensRef = useRef(0);
  const tagRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const inView = useInView(wrap, "100px");
  const total = journeyScreens(stops.length);
  const stopDays = useMemo(() => stops.map((s) => s.day), [stops]);
  const tags: CoreTag[] = useMemo(() => stops.map((s) => ({ id: s.date, day: s.day, label: s.date, detail: s.title })), [stops]);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = wrap.current;
      if (!el) return;
      const vh = window.innerHeight;
      const screens = Math.max(0, -el.getBoundingClientRect().top) / vh;
      screensRef.current = screens;
      const st = drillState(screens, stops.length);
      const heroFade = smooth(clamp01((screens - 0.12) / 0.5));
      if (hero.current) {
        hero.current.style.opacity = String(1 - heroFade);
        hero.current.style.transform = `translate3d(0, ${(-heroFade * 48).toFixed(1)}px, 0)`;
        hero.current.style.visibility = heroFade > 0.99 ? "hidden" : "visible";
      }
      if (cue.current) cue.current.style.opacity = String(1 - clamp01(screens / 0.25));
      if (drill.current) {
        const show = smooth(clamp01((screens - 0.85) / 0.35)) * (1 - clamp01(st.exit * 3));
        drill.current.style.opacity = String(show);
        drill.current.style.visibility = show < 0.01 ? "hidden" : "visible";
      }
      if (closing.current) {
        const c = smooth(clamp01((screens - (total - HOLD - EXIT * 0.35)) / (EXIT * 0.3)));
        closing.current.style.opacity = String(c);
        closing.current.style.transform = `translate3d(0, ${((1 - c) * 24).toFixed(1)}px, 0)`;
      }
      if (marker.current) {
        const lo = Math.floor(st.stop);
        const hi = Math.min(stops.length - 1, lo + 1);
        const day = st.dive < 0.02 ? 40 : 40 + (stopDays[lo] + (stopDays[hi] - stopDays[lo]) * (st.stop - lo) - 40) * st.dive;
        marker.current.style.top = `${(1 - day / 40) * 100}%`;
        if (readout.current) {
          const down = Math.floor(40 - day);
          readout.current.textContent = down <= 0 ? "16 Oct, surface" : `${fmtDay(core.start + Math.floor(day) * DAY)}, ${down} ${down === 1 ? "day" : "days"} down`;
        }
      }
      if (rail.current) rail.current.style.opacity = String(1 - clamp01(st.exit * 3));
      setActive(st.active);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [stops.length, stopDays, total, core.start]);

  const go = useCallback((i: number) => {
    const el = wrap.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + stopScreens(i) * window.innerHeight, behavior: "smooth" });
  }, []);

  return (
    <section ref={wrap} id="core" aria-label="The Orbit team's memory as an ice core" className="relative" style={{ height: `${(total + 1) * 100}svh` }}>
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <div aria-hidden className="absolute inset-0" style={{ background: "radial-gradient(70% 60% at 68% 42%, #13243b 0%, #0b111c 55%, #070b12 100%)" }} />
        <div aria-hidden className="absolute inset-0">
          {webgl ? <CoreScene data={core} stops={stopDays} screensRef={screensRef} reduced={false} active={inView} tags={tags} tagRefs={tagRefs} /> : null}
        </div>

        <div aria-hidden className="pointer-events-none absolute inset-0 hidden overflow-hidden md:block">
          {tags.map((t, i) => (
            <div
              key={t.id}
              ref={(el) => {
                tagRefs.current[i] = el;
              }}
              data-side="right"
              className="core-tag absolute left-0 top-0 opacity-0 will-change-transform"
            >
              <div className="core-tag-inner flex items-center gap-2.5 whitespace-nowrap">
                <span className="core-tag-leader h-px w-6 bg-[rgb(238_243_249/0.45)]" />
                <span className="text-[0.82rem] font-semibold text-frost t-num" style={{ fontVariationSettings: '"wdth" 88' }}>
                  {t.label}
                </span>
                <span className="core-tag-detail text-[0.8rem] text-slate" style={{ fontVariationSettings: '"wdth" 88' }}>
                  {t.detail}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="relative mx-auto flex h-full max-w-[1440px] flex-col px-6 pt-[30svh] sm:px-10 md:justify-center md:pt-20 lg:pl-40 xl:pl-48">
          <div ref={hero}>
            <HeroCopy stats={stats} onDrill={() => go(1)} />
          </div>
        </div>

        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-6 hidden justify-center md:flex" ref={cue}>
          <span className="flex flex-col items-center gap-2 text-[0.78rem] text-slate" style={{ fontVariationSettings: '"wdth" 88' }}>
            Scroll to drill
            <span className="relative h-10 w-px overflow-hidden bg-[rgb(148_176_214/0.25)]">
              <span className="absolute inset-x-0 top-0 h-4 bg-he" style={{ animation: "drill-cue 1.8s var(--ease-drill) infinite" }} />
            </span>
          </span>
        </div>

        <div ref={drill} className="pointer-events-none absolute inset-0 opacity-0" style={{ visibility: "hidden" }}>
          <div className="relative mx-auto h-full max-w-[1440px] px-6 sm:px-10 lg:pl-40 xl:pl-48">
            <div className="relative h-full w-full max-w-[34rem] max-md:[&>article]:top-[68%] lg:w-[40vw]">
              {stops.map((s, i) => (
                <StopArticle key={s.date} stop={s} active={i === active} />
              ))}
            </div>
          </div>
        </div>

        <div ref={rail}>
          <DepthRail stops={stops} active={active} markerRef={marker} readoutRef={readout} onGo={go} />
        </div>

        <div ref={closing} className="pointer-events-none absolute inset-x-0 top-[15vh] opacity-0">
          <p
            className="mx-auto max-w-[46rem] px-6 text-center text-[clamp(1.6rem,2.6vw,2.4rem)] leading-[1.12] tracking-[-0.025em] text-frost"
            style={{ fontVariationSettings: '"wdth" 108', fontWeight: 700 }}
          >
            One commitment, three dates. One service, two vendors. Nothing was overwritten.
          </p>
        </div>
      </div>
    </section>
  );
}

function StaticJourney({ core, stops, stats }: Props) {
  const list = useRef<HTMLElement>(null);
  const go = () => list.current?.scrollIntoView({ block: "start" });
  return (
    <>
      <section id="core" className="relative overflow-hidden" style={{ background: "radial-gradient(70% 60% at 68% 42%, #13243b 0%, #0b111c 55%, #070b12 100%)" }}>
        <div className="mx-auto grid min-h-[100svh] max-w-[1440px] items-center gap-12 px-6 pb-16 pt-28 sm:px-10 lg:grid-cols-[1.4fr_1fr] lg:pl-24">
          <HeroCopy stats={stats} onDrill={go} />
          <StaticCore data={core} className="mx-auto h-[70vh] max-h-[680px] w-auto" />
        </div>
      </section>
      <section ref={list} aria-label="Drilling from release day back to kickoff" className="border-t rule bg-g-800">
        <ol className="mx-auto max-w-[1100px] px-6 py-20 sm:px-10">
          {stops.map((s) => (
            <li key={s.date} className="grid gap-6 border-b rule py-12 md:grid-cols-[13rem_1fr]">
              <p className="t-h2 t-num whitespace-nowrap">{s.date}</p>
              <StopArticle stop={s} active flow />
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
