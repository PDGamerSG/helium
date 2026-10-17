"use client";

import { useEffect, useMemo, useState } from "react";
import { IconMail, IconMic, IconSearch } from "@/components/icons";
import { useResource } from "@/lib/api";
import { DAY, fmtDate, fmtDay, fmtObject, isEmailFact, istDayStart, predicateLabel, sourceTitle } from "@/lib/format";
import type { Belief, Fact, Meeting, Timeline } from "@/lib/types";
import { useWorkspace } from "./context";
import { CoreRail } from "./CoreRail";
import { KIND_LABEL } from "./marks";
import { Empty, ErrorState, Loading } from "./states";

const KINDS = [
  { id: "all", label: "Everything" },
  { id: "decision", label: "Decisions" },
  { id: "commitment", label: "Commitments" },
  { id: "fact", label: "Facts" },
] as const;

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function FactRow({ f, at, selected, onOpen }: { f: Fact; at: number; selected: boolean; onOpen: () => void }) {
  const replacedLater = f.valid_to !== null && f.valid_to > at;
  const email = isEmailFact(f);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={selected ? "true" : undefined}
        className={`grid w-full gap-x-6 gap-y-1 rounded-[10px] px-4 py-2.5 text-left transition-colors md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)_9.5rem] md:items-baseline ${
          selected ? "bg-paper-3" : "hover:bg-paper-2"
        }`}
      >
        <span className="min-w-0">
          <span className="text-[0.95rem] font-semibold text-coal">{f.subject}</span> <span className="text-[0.86rem] text-coal-3">{predicateLabel(f.predicate)}</span>
        </span>
        <span className="min-w-0">
          <span className="line-clamp-2 text-[0.98rem] font-semibold text-coal">
            {fmtObject(f.object)}
          </span>
          {replacedLater ? <span className="block text-[0.8rem] text-coal-3">Replaced on {fmtDay(f.valid_to!)}</span> : null}
        </span>
        <span className="flex min-w-0 items-center gap-2 text-[0.84rem] text-coal-3">
          {email ? <IconMail size={14} /> : <IconMic size={14} />}
          <span className="truncate">
            {f.speaker?.name ?? "Unknown"}, {fmtDay(f.valid_from)}
          </span>
        </span>
      </button>
    </li>
  );
}

export function CorePage() {
  const { tenant, drawer, openWhy } = useWorkspace();
  const timeline = useResource<Timeline>(`/tenants/${tenant}/timeline`);
  const meetings = useResource<Meeting[]>(`/tenants/${tenant}/meetings`);
  const all = useResource<Fact[]>(`/tenants/${tenant}/facts?status=all`);
  const [now] = useState(() => Date.now());
  const [t, setT] = useState<number | null>(null);
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("all");
  const [q, setQ] = useState("");

  const events = useMemo(() => timeline.data?.events ?? [], [timeline.data]);
  const range = useMemo(() => {
    if (!events.length) return null;
    const first = Math.min(...events.map((e) => e.t));
    const last = Math.max(...events.map((e) => e.t));
    const startMs = istDayStart(first) - DAY;
    const endMs = Math.max(istDayStart(last) + 2 * DAY, Math.min(now, last + 21 * DAY));
    return { start: startMs, end: endMs };
  }, [events, now]);

  const cut = t ?? range?.end ?? now;
  const query = useDebounced(cut, 140);
  const belief = useResource<Belief>(range ? `/tenants/${tenant}/belief?t=${Math.round(query)}` : null);

  const changes = useMemo(() => {
    const facts = all.data ?? [];
    const byId = new Map(facts.map((f) => [f.id, f]));
    return facts
      .filter((f) => f.supersedes_ids?.length && f.valid_from <= cut && f.valid_from > cut - 7 * DAY)
      .map((f) => ({ now: f, before: byId.get(f.supersedes_ids![0]) }))
      .sort((a, b) => b.now.valid_from - a.now.valid_from);
  }, [all.data, cut]);

  const changeDays = useMemo(
    () => [...new Set((all.data ?? []).filter((f) => f.supersedes_ids?.length).map((f) => istDayStart(f.valid_from) + DAY - 1))].sort((a, b) => a - b),
    [all.data],
  );

  const rows = useMemo(() => {
    const words = q.toLowerCase().trim();
    return (belief.data?.facts ?? [])
      .filter((f) => (kind === "all" || f.kind === kind) && (!words || `${f.subject} ${f.predicate} ${f.object} ${f.speaker?.name ?? ""}`.toLowerCase().includes(words)))
      .sort((a, b) => b.valid_from - a.valid_from);
  }, [belief.data, kind, q]);

  const counts = useMemo(() => {
    const c = { decision: 0, commitment: 0, fact: 0 };
    for (const f of belief.data?.facts ?? []) c[f.kind as keyof typeof c] = (c[f.kind as keyof typeof c] ?? 0) + 1;
    return c;
  }, [belief.data]);

  const selected = drawer?.kind === "why" ? drawer.id : null;
  const prev = [...changeDays].reverse().find((d) => d < cut - 1000);
  const next = changeDays.find((d) => d > cut + 1000);
  const atSurface = range ? cut >= range.end - DAY : true;

  if (timeline.error)
    return (
      <div className="p-8">
        <ErrorState error={timeline.error} onRetry={timeline.reload} />
      </div>
    );

  if (timeline.data && events.length === 0)
    return (
      <div className="p-8">
        <Empty title="No team memory yet">Import a meeting or email into this workspace to start building its record.</Empty>
      </div>
    );

  return (
    <div className="grid min-h-full grid-cols-[8.5rem_minmax(0,1fr)] lg:grid-cols-[9.5rem_minmax(0,1fr)]">
      <aside aria-label="Timeline" className="sticky top-0 h-[calc(100svh-4rem)] border-r rule bg-paper-2/70 max-md:h-[calc(100svh-7.125rem)]">
        {range && meetings.data ? (
          <CoreRail events={events} meetings={meetings.data} start={range.start} end={range.end} t={cut} onChange={setT} />
        ) : (
          <div className="p-4">
            <Loading rows={6} />
          </div>
        )}
      </aside>

      <section className="min-w-0 px-5 pb-16 pt-8 sm:px-8 lg:px-12">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1
              className="t-num text-[clamp(2rem,3.6vw,2.75rem)] font-semibold leading-none tracking-[-0.045em] text-coal"
            >
              {atSurface ? "Today" : fmtDate(cut)}
              <span className="sr-only">: what the team {atSurface ? "believes now" : "believed at the end of that day"}</span>
            </h1>
            <p aria-hidden className="mt-2 text-[0.92rem] text-coal-3">
              {atSurface ? "What the team believes now" : "What the team believed at the end of that day"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-line btn-sm" disabled={prev === undefined} onClick={() => prev !== undefined && setT(prev)}>
              Previous change
            </button>
            <button type="button" className="btn btn-line btn-sm" disabled={next === undefined} onClick={() => next !== undefined && setT(next)}>
              Next change
            </button>
            <button type="button" className="btn btn-line btn-sm" disabled={atSurface} onClick={() => setT(null)}>
              Back to today
            </button>
          </div>
        </div>

        <p className="mt-4 text-[0.96rem] text-coal-2" aria-live="polite">
          {belief.data ? (
            <>
              <span className="t-num font-semibold text-coal">{belief.data.facts.length}</span> in force: {counts.decision} decisions, {counts.commitment} commitments,{" "}
              {counts.fact} facts.
              {changes.length ? ` ${changes.length} changed in the week before.` : " Nothing changed in the week before."}
            </>
          ) : (
            "Reading the record"
          )}
        </p>

        {changes.length ? (
          <section aria-labelledby="changes-title" className="mt-8">
            <h2 id="changes-title" className="text-[0.95rem] font-semibold text-coal">
              Changed in the week before
            </h2>
            <ul className="mt-3 grid gap-2 xl:grid-cols-2">
              {changes.map(({ now: f, before }) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => openWhy(f.id)}
                    className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[10px] border rule bg-white px-4 py-3 text-left hover:border-[rgb(14_14_16/0.25)]"
                  >
                    <span className="w-full text-[0.84rem] text-coal-3">
                      {f.subject}, {predicateLabel(f.predicate)}
                    </span>
                    {before ? <span className="mark-superseded">{fmtObject(before.object)}</span> : null}
                    <span aria-hidden className="text-coal-3">
                      to
                    </span>
                    <span className="mark-current text-[0.9rem]">{fmtObject(f.object)}</span>
                    <span className="ml-auto text-[0.82rem] text-coal-3">
                      {f.speaker?.name}, {isEmailFact(f) ? "email" : sourceTitle(f)}, {fmtDay(f.valid_from)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="sticky top-0 z-10 -mx-2 mt-10 flex flex-wrap items-center gap-3 bg-white/95 px-2 py-3 backdrop-blur-sm">
          <div role="tablist" aria-label="Kind" className="flex max-w-full overflow-x-auto rounded-[10px] border rule p-0.5">
            {KINDS.map((k) => (
              <button
                key={k.id}
                role="tab"
                type="button"
                aria-selected={kind === k.id}
                onClick={() => setKind(k.id)}
                className={`shrink-0 rounded-[6px] px-3 py-1.5 text-[0.88rem] transition-colors ${kind === k.id ? "bg-paper-3 font-semibold text-coal" : "text-coal-2 hover:text-coal"}`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-full sm:w-72">
            <label htmlFor="fact-filter" className="sr-only">
              Filter facts
            </label>
            <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-coal-3" />
            <input
              id="fact-filter"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by subject, value or person"
              className="field h-9 min-h-0 pl-9 text-[0.9rem]"
            />
          </div>
        </div>

        <div className={`mt-2 transition-opacity ${belief.loading && belief.data ? "opacity-60" : ""}`}>
          {belief.error ? (
            <ErrorState error={belief.error} onRetry={belief.reload} />
          ) : !belief.data ? (
            <Loading rows={8} />
          ) : rows.length === 0 ? (
            <Empty title={q ? "Nothing matches that filter" : "Nothing was in force on this date"}>
              {q ? "Try a subject, a value or a person's name." : "Drag the cut higher, towards the surface."}
            </Empty>
          ) : (
            (["decision", "commitment", "fact"] as const)
              .filter((k) => kind === "all" || kind === k)
              .map((k) => {
                const list = rows.filter((f) => f.kind === k);
                if (!list.length) return null;
                return (
                  <section key={k} aria-label={KIND_LABEL[k]} className="mt-6">
                    <h2 className="flex items-baseline gap-2 px-4 text-[0.9rem] font-semibold text-coal-2">
                      {KIND_LABEL[k]}s <span className="t-num text-coal-3">{list.length}</span>
                    </h2>
                    <ul className="mt-1 divide-y divide-[rgb(14_14_16/0.06)]">
                      {list.map((f) => (
                        <FactRow key={f.id} f={f} at={cut} selected={selected === f.id} onOpen={() => openWhy(f.id)} />
                      ))}
                    </ul>
                  </section>
                );
              })
          )}
        </div>
      </section>
    </div>
  );
}
