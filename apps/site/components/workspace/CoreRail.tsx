"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DAY, fmtDay, istDayStart } from "@/lib/format";
import type { Meeting, TimelineEvent } from "@/lib/types";

type Props = {
  events: TimelineEvent[];
  meetings: Meeting[];
  start: number;
  end: number;
  t: number;
  onChange: (t: number) => void;
};

type DayInfo = { day: number; meetings: string[]; emails: string[]; superseded: number; facts: number };

const PAD_TOP = 34;
const PAD_BOTTOM = 34;
const CORE_X = 18;
const CORE_W = 46;

/**
 * The team's timeline as a vertical core: the latest day is at the top, kickoff at the bottom.
 * Meetings are graphite bands sized by how much was said, emails are thin lines, and an orange line marks a day where something was superseded.
 * The cut is a slider: drag it, click a layer, or use the arrow keys (a day), Page keys (a week), Home and End.
 */
export function CoreRail({ events, meetings, start, end, t, onChange }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setH(Math.max(260, entry.contentRect.height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const span = end - start;
  const inner = h - PAD_TOP - PAD_BOTTOM;
  const yOf = (ms: number) => PAD_TOP + (1 - (ms - start) / span) * inner;
  const msOf = (y: number) => start + (1 - (y - PAD_TOP) / inner) * span;
  const totalDays = Math.round(span / DAY);

  const days = useMemo(() => {
    const map = new Map<number, DayInfo>();
    const get = (ms: number) => {
      const d = istDayStart(ms);
      let info = map.get(d);
      if (!info) map.set(d, (info = { day: d, meetings: [], emails: [], superseded: 0, facts: 0 }));
      return info;
    };
    for (const e of events) {
      if (e.type === "meeting") get(e.t).meetings.push(e.text);
      else if (e.type === "email") get(e.t).emails.push(e.text);
      else if (e.type === "fact.superseded") get(e.t).superseded += 1;
      else get(e.t).facts += 1;
    }
    return map;
  }, [events]);

  const episodesByTitle = useMemo(() => new Map(meetings.map((m) => [m.title, m.episodes])), [meetings]);

  const clampT = (ms: number) => Math.min(end, Math.max(start, ms));
  const setFromY = (clientY: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const ms = clampT(msOf(clientY - rect.top));
    onChange(Math.min(end, istDayStart(ms) + DAY - 1));
  };

  const cutY = yOf(clampT(t));
  const hoverInfo = hover !== null ? days.get(hover) : undefined;
  const weekTicks: number[] = [];
  for (let d = istDayStart(start); d <= end; d += DAY) if (new Date(d + 5.5 * 3600e3).getUTCDay() === 1) weekTicks.push(d);

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowUp" ? DAY : e.key === "ArrowDown" ? -DAY : e.key === "PageUp" ? 7 * DAY : e.key === "PageDown" ? -7 * DAY : 0;
    if (step) {
      e.preventDefault();
      onChange(clampT(t + step));
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(istDayStart(start) + DAY - 1);
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(end);
    }
  };

  return (
    <div
      ref={box}
      className="relative h-full touch-none select-none"
      onPointerDown={(e) => {
        setDragging(true);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setFromY(e.clientY);
      }}
      onPointerMove={(e) => {
        const rect = box.current?.getBoundingClientRect();
        if (rect) setHover(istDayStart(clampT(msOf(e.clientY - rect.top))));
        if (dragging) setFromY(e.clientY);
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onPointerLeave={() => setHover(null)}
    >
      <svg width="100%" height={h} className="block" aria-hidden>
        <defs>
          <clipPath id="rail-clip">
            <rect x={CORE_X} y={PAD_TOP} width={CORE_W} height={inner} rx={10} />
          </clipPath>
        </defs>
        <rect x={CORE_X} y={PAD_TOP} width={CORE_W} height={inner} rx={10} fill="#f2f2f4" />
        <g clipPath="url(#rail-clip)">
          {[...days.values()].map((d) => {
            const y = yOf(d.day + 0.45 * DAY);
            return (
              <g key={d.day}>
                {d.meetings.map((m, i) => {
                  const th = 3 + Math.min(10, (episodesByTitle.get(m) ?? 30) / 6);
                  return <rect key={i} x={CORE_X} y={y - th / 2 - i * 2} width={CORE_W} height={th} fill="#0e0e10" opacity={0.14} />;
                })}
                {d.emails.map((_, i) => (
                  <rect key={`e${i}`} x={CORE_X} y={yOf(d.day + 0.62 * DAY) - 0.9 - i * 3} width={CORE_W} height={1.2} fill="#0e0e10" opacity={0.45} />
                ))}
                {d.superseded ? <rect x={CORE_X} y={yOf(d.day + 0.5 * DAY) - 1.2} width={CORE_W} height={2.4} fill="#ff5a1f" /> : null}
              </g>
            );
          })}
          {hover !== null ? <rect x={CORE_X} y={yOf(hover + DAY)} width={CORE_W} height={Math.max(2, inner / totalDays)} fill="#0e0e10" opacity={0.06} /> : null}
        </g>
        <rect x={CORE_X} y={PAD_TOP} width={CORE_W} height={inner} rx={10} fill="none" stroke="rgb(14 14 16 / 0.12)" />
        {weekTicks.map((d) => (
          <g key={d}>
            <line x1={CORE_X + CORE_W + 4} x2={CORE_X + CORE_W + 10} y1={yOf(d)} y2={yOf(d)} stroke="rgb(14 14 16 / 0.22)" />
            <text x={CORE_X + CORE_W + 14} y={yOf(d) + 4} fontSize={11} fill="#75757e">
              {fmtDay(d)}
            </text>
          </g>
        ))}
        <line x1={CORE_X - 6} x2={CORE_X + CORE_W + 6} y1={cutY} y2={cutY} stroke="#0e0e10" strokeWidth={2} />
      </svg>

      <div
        role="slider"
        tabIndex={0}
        aria-label="Belief date"
        aria-valuemin={start}
        aria-valuemax={end}
        aria-valuenow={t}
        aria-valuetext={fmtDay(t)}
        onKeyDown={onKey}
        className="absolute left-0 right-0 h-0 outline-none [&:focus-visible>span]:outline [&:focus-visible>span]:outline-2 [&:focus-visible>span]:outline-offset-2 [&:focus-visible>span]:outline-coal"
        style={{ top: cutY }}
      >
        <span
          className="t-num absolute left-[4.6rem] top-0 -translate-y-1/2 whitespace-nowrap rounded-[6px] bg-coal px-1.5 py-0.5 text-[0.76rem] font-semibold text-white shadow-[0_6px_18px_-8px_rgb(14_14_16/0.4)]"
        >
          {t >= end - DAY ? "Today" : fmtDay(t)}
        </span>
      </div>

      <span className="t-label absolute left-3 top-2">Latest</span>
      <span className="t-label absolute bottom-2 left-3">Earliest</span>

      {hoverInfo && hover !== null && !dragging ? (
        <div
          className="pointer-events-none absolute left-[4.4rem] z-20 w-56 -translate-y-1/2 rounded-[10px] border rule bg-white p-3 shadow-[0_18px_40px_-16px_rgb(14_14_16/0.18)]"
          style={{ top: Math.min(h - 60, Math.max(60, yOf(hover + DAY / 2))) }}
        >
          <p className="t-num text-[0.82rem] font-semibold text-coal">{fmtDay(hover)}</p>
          <ul className="mt-1 space-y-0.5 text-[0.8rem] text-coal-2">
            {hoverInfo.meetings.map((m) => (
              <li key={m}>Meeting: {m}</li>
            ))}
            {hoverInfo.emails.map((m) => (
              <li key={m}>Email: {m}</li>
            ))}
            {hoverInfo.superseded ? <li className="text-coal-3">{hoverInfo.superseded} superseded</li> : null}
            {hoverInfo.facts ? <li className="text-coal-3">{hoverInfo.facts} new facts</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
