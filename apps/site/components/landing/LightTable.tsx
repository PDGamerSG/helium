"use client";

import { useId, useMemo, useState } from "react";
import { IconMail, IconMic } from "@/components/icons";
import { DAY, fmtDate, fmtDay, fmtObject } from "@/lib/format";

type Link = { id: string; value: string; validFrom: number; validTo: number | null; speaker: string; source: string; sourceKind: "meeting" | "email" };
type Lane = { key: string; label: string; links: Link[] };

type Props = {
  lanes: Lane[];
  intervals: [number, number | null][];
  start: number;
  days: number;
  cypher: string;
};

/**
 * Belief at a date, on a light table. The cut is a native range input stretched over the lanes,
 * so it drags with a pointer and steps with the keyboard. Values come from the Orbit sample's facts.
 */
export function LightTable({ lanes, intervals, start, days, cypher }: Props) {
  const id = useId();
  const [day, setDay] = useState(9);
  const t = start + (day + 1) * DAY - 1;
  const pct = (ms: number) => Math.min(100, Math.max(0, ((ms - start) / (days * DAY)) * 100));
  const inForce = useMemo(() => intervals.filter(([from, to]) => from <= t && (to === null || to > t)).length, [intervals, t]);
  const changes = useMemo(() => {
    const set = new Map<number, string>();
    for (const lane of lanes)
      for (const l of lane.links.slice(1)) {
        const d = Math.floor((l.validFrom - start) / DAY);
        set.set(d, fmtDay(l.validFrom));
      }
    return [...set.entries()].sort((a, b) => a[0] - b[0]);
  }, [lanes, start]);

  const ticks = [0, 7, 14, 21, 28, 35];

  return (
    <div className="sheet relative overflow-hidden p-5 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <output
            htmlFor={id}
            aria-live="polite"
            className="t-num block text-[clamp(2rem,3.4vw,2.9rem)] leading-none tracking-[-0.03em] text-ink"
            style={{ fontVariationSettings: '"wdth" 110', fontWeight: 760 }}
          >
            {fmtDate(t)}
          </output>
          <label htmlFor={id} className="mt-2 block text-[0.9rem] text-ink-soft">
            What the team believed at the end of that day. Drag the cut to change it.
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Jump to a change">
          <span className="mr-1 text-[0.86rem] text-ink-soft">Jump to a change</span>
          {changes.map(([d, label]) => (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              aria-pressed={day === d}
              className={`t-num rounded-[2px] border px-2.5 py-1 text-[0.86rem] font-semibold transition-colors ${
                day === d ? "border-ink bg-ink text-sheet" : "border-[rgb(11_17_28/0.25)] text-ink hover:border-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Lanes: scroll sideways on narrow screens rather than squeezing the dates together. */}
      <div className="-mx-5 mt-8 overflow-x-auto px-5 pb-2 sm:mx-0 sm:px-0">
        <div className="grid min-w-[40rem] grid-cols-[7.5rem_1fr] gap-x-4 sm:grid-cols-[10rem_1fr]">
          <div />
          <div className="relative h-6">
            {ticks.map((d) => (
              <span key={d} className="t-num absolute -translate-x-1/2 text-[0.78rem] text-ink-soft" style={{ left: `${(d / days) * 100}%` }}>
                {fmtDay(start + d * DAY)}
              </span>
            ))}
          </div>

          {lanes.map((lane) => (
            <div key={lane.key} className="contents">
              <div className="flex min-h-[3.25rem] items-center border-t border-[rgb(11_17_28/0.12)] pr-2 text-[0.92rem] font-semibold leading-tight text-ink">
                {lane.label}
              </div>
              <div className="relative min-h-[3.25rem] border-t border-[rgb(11_17_28/0.12)]">
                {lane.links.map((l) => {
                  const live = l.validFrom <= t && (l.validTo === null || l.validTo > t);
                  const ended = l.validTo !== null && l.validTo <= t;
                  const future = l.validFrom > t;
                  const left = pct(l.validFrom);
                  const right = pct(l.validTo ?? start + days * DAY);
                  const cut = pct(t);
                  const label = fmtObject(l.value);
                  const title = `${label}, from ${fmtDay(l.validFrom)}${l.validTo ? ` to ${fmtDay(l.validTo)}` : ""}`;
                  if (live) {
                    // A value that came into force just before the cut is a sliver; its label rides on top as a pill so it stays readable.
                    const narrow = cut - left < 7;
                    return (
                      <div key={l.id} title={title}>
                        <div
                          className="absolute top-1/2 flex h-8 -translate-y-1/2 items-center overflow-hidden whitespace-nowrap rounded-l-[2px] bg-he px-2 text-[0.84rem] font-semibold text-he-ink"
                          style={{ left: `calc(${left}% + 1px)`, width: `calc(${Math.max(cut - left, 0.5)}% - 1px)` }}
                        >
                          {narrow ? null : <span className="truncate">{label}</span>}
                          <span className="sr-only">{narrow ? label : ""} (in force on this date)</span>
                        </div>
                        {right > cut + 0.3 ? (
                          <div
                            aria-hidden
                            className="absolute top-1/2 h-8 -translate-y-1/2 rounded-r-[2px] border border-l-0 border-dashed border-[rgb(201_96_58/0.55)] bg-[rgb(255_174_138/0.12)]"
                            style={{ left: `${cut}%`, width: `calc(${right - cut}% - 1px)` }}
                          />
                        ) : null}
                        {narrow ? (
                          <span
                            aria-hidden
                            className="pointer-events-none absolute top-1/2 z-[15] flex h-8 -translate-y-1/2 items-center whitespace-nowrap rounded-[2px] bg-he px-2 text-[0.84rem] font-semibold text-he-ink shadow-[0_4px_10px_-4px_rgb(11_17_28/0.35)]"
                            style={{ left: `calc(${left}% + 1px)` }}
                          >
                            {label}
                          </span>
                        ) : null}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={l.id}
                      className={`absolute top-1/2 flex h-8 -translate-y-1/2 items-center overflow-hidden whitespace-nowrap rounded-[2px] px-2 text-[0.84rem] font-semibold ${
                        ended
                          ? "border border-[rgb(11_17_28/0.28)] bg-[rgb(11_17_28/0.04)] text-ink-soft line-through decoration-[1.5px]"
                          : "border border-dashed border-[rgb(11_17_28/0.3)] text-[rgb(11_17_28/0.45)]"
                      }`}
                      style={{ left: `calc(${left}% + 1px)`, width: `calc(${right - left}% - 2px)` }}
                      title={title}
                    >
                      <span className="truncate">{label}</span>
                      <span className="sr-only">{future ? " (not yet said)" : " (superseded)"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div />
          <div className="relative" style={{ marginTop: `-${lanes.length * 3.25}rem`, height: `${lanes.length * 3.25}rem` }}>
            <input
              id={id}
              type="range"
              min={0}
              max={days - 1}
              step={1}
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
              aria-valuetext={fmtDate(t)}
              className="peer absolute inset-0 z-20 h-full w-full cursor-ew-resize opacity-0"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-[-0.75rem] z-10 w-[2px] -translate-x-1/2 bg-ink outline-offset-4 outline-ink peer-focus-visible:outline-2 peer-focus-visible:outline"
              style={{ left: `${((day + 1) / days) * 100}%` }}
            >
              <span className="absolute -top-2 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-ink" />
            </div>
          </div>
        </div>
      </div>

      <p className="mt-2 text-[0.82rem] text-ink-soft sm:hidden">Swipe the timeline sideways to reach October.</p>

      {/* Answers at the cut */}
      <div className="mt-8 grid gap-px overflow-hidden rounded-[2px] border border-[rgb(11_17_28/0.14)] bg-[rgb(11_17_28/0.14)] md:grid-cols-3">
        {lanes.map((lane) => {
          const live = lane.links.find((l) => l.validFrom <= t && (l.validTo === null || l.validTo > t));
          const replaced = lane.links.filter((l) => l.validTo !== null && l.validTo <= t);
          const next = live ? lane.links.find((l) => l.validFrom > live.validFrom) : lane.links[0];
          return (
            <div key={lane.key} className="bg-sheet p-5">
              <p className="text-[0.84rem] font-semibold text-ink-soft" style={{ fontVariationSettings: '"wdth" 88' }}>
                {lane.label}
              </p>
              {live ? (
                <>
                  <p className="mt-2 text-[1.6rem] leading-tight tracking-[-0.02em] text-ink" style={{ fontVariationSettings: '"wdth" 106', fontWeight: 720 }}>
                    {fmtObject(live.value)}
                  </p>
                  <p className="mt-2 flex items-center gap-1.5 text-[0.9rem] text-ink-soft">
                    {live.sourceKind === "email" ? <IconMail size={15} /> : <IconMic size={15} />}
                    {live.speaker}, {live.sourceKind === "email" ? "email" : live.source}, {fmtDay(live.validFrom)}
                  </p>
                  <p className="mt-3 text-[0.9rem] text-ink">
                    {replaced.length ? (
                      <>
                        Replaced <span className="line-through decoration-[1.5px]">{replaced.map((r) => fmtObject(r.value)).join(", ")}</span>.{" "}
                      </>
                    ) : null}
                    {next && next !== live && next.validFrom > t ? `Changes on ${fmtDay(next.validFrom)}.` : "Still in force today."}
                  </p>
                </>
              ) : (
                <>
                  <p
                    className="mt-2 text-[1.6rem] leading-tight tracking-[-0.02em] text-[rgb(11_17_28/0.45)]"
                    style={{ fontVariationSettings: '"wdth" 106', fontWeight: 720 }}
                  >
                    Not yet said
                  </p>
                  <p className="mt-2 text-[0.9rem] text-ink-soft">No source mentions it before this date.</p>
                </>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-[0.92rem] text-ink-soft">
        On this date Helium returns <span className="t-num font-semibold text-ink">{inForce}</span> facts in force for the Orbit team. The three above are the ones that
        changed.
      </p>

      <details className="group mt-5 rounded-[2px] border border-[rgb(11_17_28/0.16)]">
        <summary className="cursor-pointer list-none px-4 py-3 text-[0.9rem] font-semibold text-ink [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Show the Cypher that answers this</span>
          <span className="hidden group-open:inline">Hide the Cypher</span>
        </summary>
        <pre className="code overflow-x-auto border-t border-[rgb(11_17_28/0.12)] bg-[#e6ecf3] px-4 py-4 text-ink">
          <code>{`// t = ${new Date(t).toISOString()}\n${cypher}`}</code>
        </pre>
      </details>
    </div>
  );
}
