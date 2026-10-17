"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconAgent, IconBolt } from "@/components/icons";
import { api, ApiError, useResource, useSource } from "@/lib/api";
import { agentName } from "@/lib/agents";
import { fmtObject, fmtRelative, fmtTime } from "@/lib/format";
import type { Agent, Fact, HeliumEvent, Skill, Task, TaskTrace } from "@/lib/types";
import { useWorkspace } from "./context";
import { Empty, ErrorState, Loading } from "./states";

const COLUMNS = [
  { id: "submitted", label: "Submitted" },
  { id: "working", label: "Working" },
  { id: "input_required", label: "Needs input" },
  { id: "completed", label: "Completed" },
  { id: "failed", label: "Failed" },
];

/** Event names the Helium API publishes on its SSE stream (named events, so each needs its own listener). */
const EVENT_NAMES = [
  "fact.created",
  "fact.superseded",
  "commitment.created",
  "commitment.updated",
  "episode.ingested",
  "task.submitted",
  "task.claimed",
  "task.handed_off",
  "task.completed",
  "task.failed",
  "task.input_required",
  "skill.learned",
  "skill.ran",
];

function useEvents(tenant: string) {
  const [events, setEvents] = useState<(HeliumEvent & { key: number })[]>([]);
  const [state, setState] = useState<"connecting" | "open" | "closed">("connecting");
  const n = useRef(0);
  useEffect(() => {
    const es = new EventSource(`/api/helium/tenants/${tenant}/events`);
    const onEvent = (m: MessageEvent) => {
      try {
        const e = JSON.parse(m.data) as HeliumEvent;
        if (!e.event || e.event === "connected" || e.event === "sample.connected") return;
        setEvents((list) => [{ ...e, key: n.current++ }, ...list].slice(0, 60));
      } catch {}
    };
    es.onopen = () => setState("open");
    es.onerror = () => setState(es.readyState === EventSource.CLOSED ? "closed" : "connecting");
    es.onmessage = onEvent;
    for (const name of EVENT_NAMES) es.addEventListener(name, onEvent);
    return () => es.close();
  }, [tenant]);
  return { events, state };
}

function summary(p: Record<string, unknown>) {
  const pick = ["text", "summary", "kind", "agent", "task_id", "fact_id", "new_object", "status"];
  const parts = pick.filter((k) => p[k] !== undefined && p[k] !== null).map((k) => `${k.replace(/_/g, " ")} ${String(p[k])}`);
  return parts.slice(0, 3).join(", ");
}

function Trace({ taskId }: { taskId: string }) {
  const { tenant } = useWorkspace();
  const trace = useResource<TaskTrace>(`/tenants/${tenant}/tasks/${encodeURIComponent(taskId)}/trace`);
  if (trace.error) return <ErrorState error={trace.error} onRetry={trace.reload} />;
  if (!trace.data) return <Loading rows={3} />;
  return (
    <ol className="mt-3 border-l border-[rgb(14_14_16/0.12)]">
      {trace.data.events.map((e, i) => (
        <li key={i} className="relative pb-3 pl-4">
          <span aria-hidden className="absolute -left-[4px] top-1.5 h-[7px] w-[7px] rounded-full bg-coal-3" />
          <p className="text-[0.86rem] text-coal">
            <span className="font-semibold">{e.type.replace(/_/g, " ")}</span>
            {e.agent ? <span className="text-coal-3"> by {agentName(e.agent)}</span> : null}
          </p>
          <p className="t-num text-[0.78rem] text-coal-3">{fmtTime(e.t)}</p>
          {e.summary ? <p className="mt-0.5 text-[0.84rem] text-coal-2">{e.summary}</p> : null}
        </li>
      ))}
    </ol>
  );
}

type DemoResult =
  { kind: "supersede"; old_fact_id: string; new_fact_id: string } | { kind: "claim"; winners: number; losers: number; task_id: string; winner_agent: string };

/** ISO date of the first Friday after `ms`, in IST. */
function nextFriday(ms: number) {
  const ist = new Date(ms + 5.5 * 3600e3);
  const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() !== 5);
  return d.toISOString().slice(0, 10);
}

function DemoActions({ onDone }: { onDone: () => void }) {
  const { tenant, openWhy } = useWorkspace();
  const source = useSource();
  const [confirm, setConfirm] = useState<"supersede" | "claim" | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const live = source === "live";
  // "Move it to Friday" targets the PayU integration commitment when the team has one (as the API's own default does),
  // otherwise the most recent dated commitment, and moves it to the Friday after its current due date.
  const commitments = useResource<Fact[]>(live ? `/tenants/${tenant}/facts?status=active&kind=commitment` : null);
  const target = useMemo(() => {
    const dated = (commitments.data ?? []).filter((f) => f.due_at);
    return dated.find((f) => f.subject.toLowerCase() === "payu integration" && f.predicate === "due") ?? [...dated].sort((a, b) => b.valid_from - a.valid_from)[0];
  }, [commitments.data]);
  const friday = target?.due_at ? nextFriday(target.due_at) : null;

  const run = async (kind: "supersede" | "claim") => {
    setBusy(true);
    setError(null);
    try {
      if (kind === "supersede") {
        if (!target || !friday) throw new ApiError(404, "no_commitment", "This team has no dated commitment to move.");
        const r = await api<{ old_fact_id: string; new_fact_id: string }>(`/tenants/${tenant}/demo/supersede`, {
          method: "POST",
          body: { fact_id: target.id, new_object: friday, speaker_id: target.speaker?.id },
        });
        setResult({ kind, ...r });
      } else {
        const r = await api<{ winners: number; losers: number; task_id: string; winner_agent: string }>(`/tenants/${tenant}/demo/double-claim`, {
          method: "POST",
          body: {},
        });
        setResult({ kind, ...r });
      }
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The action failed.");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const actions = [
    {
      id: "supersede" as const,
      title: "Move a commitment to Friday",
      body:
        target && friday
          ? `Moves ${target.subject} from ${fmtObject(target.object)} to ${fmtObject(friday)}. Tempo wakes from the change log, claims a task and hands off to Relay.`
          : "Writes a new fact that supersedes an open commitment. Tempo wakes from the change log, claims a task and hands off to Relay.",
    },
    { id: "claim" as const, title: "Run a 25-agent claim race", body: "Launches 25 concurrent compare-and-set claims on one task. Exactly one should win." },
  ];

  return (
    <section aria-labelledby="demo-title" className="rounded-[10px] border rule bg-white p-5">
      <h2 id="demo-title" className="text-[1rem] font-semibold text-coal">
        Wake the agents
      </h2>
      <p className="mt-1 text-[0.88rem] text-coal-3">
        {live ? "These write to the team graph, so each one asks first." : "Connect the Helium API to run these. The sample is read-only."}
      </p>
      <div className="mt-4 space-y-3">
        {actions.map((a) => (
          <div key={a.id} className="rounded-[10px] border rule p-4">
            <p className="font-semibold text-coal">{a.title}</p>
            <p className="mt-1 text-[0.88rem] text-coal-2">{a.body}</p>
            {confirm === a.id ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[0.86rem] font-semibold text-signal-ink">This changes {tenant}&apos;s graph. Continue?</span>
                <button type="button" disabled={busy} onClick={() => run(a.id)} className="btn btn-ink btn-sm">
                  {busy ? "Running" : "Yes, run it"}
                </button>
                <button type="button" disabled={busy} onClick={() => setConfirm(null)} className="btn btn-line btn-sm">
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" disabled={!live || busy} onClick={() => setConfirm(a.id)} className="btn btn-line btn-sm mt-3">
                <IconBolt size={15} /> {a.id === "supersede" ? "Move it" : "Start the race"}
              </button>
            )}
          </div>
        ))}
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-[0.9rem] text-flag">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="mt-4 rounded-[10px] border border-[rgb(14_14_16/0.1)] bg-paper-2 p-4 text-[0.92rem]" aria-live="polite">
          {result.kind === "supersede" ? (
            <p className="text-coal-2">
              New fact written.{" "}
              <button type="button" onClick={() => openWhy(result.new_fact_id)} className="font-semibold text-coal underline underline-offset-4">
                Open why
              </button>{" "}
              and watch the events stream.
            </p>
          ) : (
            <p className="text-coal-2">
              <span className="font-semibold text-coal">{result.winners} winner</span>, {result.losers} claims got no row. Won by {result.winner_agent}.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function AgentsPage() {
  const { tenant } = useWorkspace();
  const agents = useResource<Agent[]>(`/tenants/${tenant}/agents`);
  const tasks = useResource<Task[]>(`/tenants/${tenant}/tasks`);
  const skills = useResource<Skill[]>(`/tenants/${tenant}/skills`);
  const { events, state } = useEvents(tenant);
  const [open, setOpen] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  const reloadTasks = tasks.reload;
  const reloadAgents = agents.reload;
  useEffect(() => {
    if (!events.length) return;
    const id = setTimeout(() => {
      reloadTasks();
      reloadAgents();
    }, 400);
    return () => clearTimeout(id);
  }, [events.length, reloadTasks, reloadAgents]);

  const byStatus = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const t of tasks.data ?? []) (map[t.status] ??= []).push(t);
    for (const list of Object.values(map)) list.sort((a, b) => b.updated_at - a.updated_at);
    return map;
  }, [tasks.data]);

  return (
    <div className="px-5 pb-20 pt-8 sm:px-8 lg:px-12">
      <h1 className="t-h2 text-coal">Crew works in the same memory</h1>
      <p className="mt-4 max-w-[62ch] text-[1.02rem] text-coal-2">
        Agents wake from Neo4j&apos;s change log, claim tasks with compare-and-set, and hand off with graph pointers as context. Drafts wait for a person.
      </p>

      <div className="mt-10 grid gap-8 xl:grid-cols-[18rem_minmax(0,1fr)_22rem]">
        <section aria-labelledby="roster-title">
          <h2 id="roster-title" className="text-[1rem] font-semibold text-coal">
            Roster
          </h2>
          <div className="mt-3">
            {agents.error ? (
              <ErrorState error={agents.error} onRetry={agents.reload} />
            ) : !agents.data ? (
              <Loading rows={5} />
            ) : (
              <ul className="divide-y divide-[rgb(14_14_16/0.07)] border-y rule">
                {agents.data
                  .filter((a) => !a.id.startsWith("demo_claimer"))
                  .map((a) => (
                    <li key={a.id} className="flex items-start gap-3 py-3">
                      <span
                        className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border ${a.state === "working" ? "border-[rgb(255_90_31/0.4)] bg-signal-soft text-signal-ink" : "border-[rgb(14_14_16/0.2)] text-coal-2"}`}
                      >
                        <IconAgent size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-coal">{agentName(a.id, a.name)}</span>
                        <span className="block text-[0.82rem] text-coal-3">
                          {a.state === "working" ? "Working" : "Idle"}, seen {fmtRelative(a.last_seen, now)}
                        </span>
                        <span className="mt-1 block text-[0.8rem] text-coal-2">{a.capabilities.join(", ")}</span>
                      </span>
                    </li>
                  ))}
                {agents.data.some((a) => a.id.startsWith("demo_claimer")) ? (
                  <li className="flex items-start gap-3 py-3">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-dashed border-[rgb(14_14_16/0.2)] text-coal-3">
                      <IconAgent size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-coal">{agents.data.filter((a) => a.id.startsWith("demo_claimer")).length} race claimants</span>
                      <span className="block text-[0.82rem] text-coal-3">Registered by the claim race demo</span>
                    </span>
                  </li>
                ) : null}
              </ul>
            )}
          </div>

          <h2 className="mt-8 text-[1rem] font-semibold text-coal">Learned routines</h2>
          <div className="mt-3">
            {skills.error ? (
              <ErrorState error={skills.error} onRetry={skills.reload} />
            ) : !skills.data ? (
              <Loading rows={2} />
            ) : skills.data.length === 0 ? (
              <Empty title="No routines learned yet">Two meetings with the same shape teach Pulse a routine.</Empty>
            ) : (
              <ul className="space-y-3">
                {skills.data.map((s) => (
                  <li key={s.id} className="rounded-[10px] border rule p-3">
                    <p className="text-[0.92rem] text-coal">{s.goal}</p>
                    <ol className="mt-2 flex flex-wrap gap-1.5">
                      {s.steps.map((st) => (
                        <li key={st.order} className="code rounded-[6px] bg-paper-2 px-1.5 py-0.5 text-[0.7rem] text-coal-2">
                          {st.tool}
                        </li>
                      ))}
                    </ol>
                    <p className="t-num mt-2 text-[0.8rem] text-coal-3">
                      {s.runs} runs, {Math.round(s.success_rate * 100)}% accepted{s.pagerank != null ? `, PageRank ${s.pagerank.toFixed(2)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section aria-labelledby="board-title" className="min-w-0">
          <h2 id="board-title" className="text-[1rem] font-semibold text-coal">
            Task board
          </h2>
          <div className="mt-3">
            {tasks.error ? (
              <ErrorState error={tasks.error} onRetry={tasks.reload} />
            ) : !tasks.data ? (
              <Loading rows={4} />
            ) : tasks.data.length === 0 ? (
              <Empty title="No tasks yet">Supersede a fact and Tempo submits one. Tasks appear here as the crew claims, hands off and completes them.</Empty>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                {COLUMNS.filter((c) => byStatus[c.id]?.length).map((c) => (
                  <div key={c.id} className="rounded-[10px] border rule bg-paper-2/70 p-3">
                    <h3 className="flex items-baseline justify-between px-1 text-[0.88rem] font-semibold text-coal-2">
                      {c.label} <span className="t-num text-coal-3">{byStatus[c.id].length}</span>
                    </h3>
                    <ul className="mt-2 space-y-2">
                      {byStatus[c.id].map((t) => (
                        <li key={t.id} className="rounded-[10px] border rule bg-white p-3">
                          <button type="button" onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id} className="w-full text-left">
                            <span className="block font-semibold text-coal">{t.kind.replace(/_/g, " ")}</span>
                            <span className="t-num block text-[0.8rem] text-coal-3">
                              {t.owner_agent ? agentName(t.owner_agent) : "Unclaimed"}, version {t.version}, {fmtRelative(t.updated_at, now)}
                            </span>
                          </button>
                          {open === t.id ? <Trace taskId={t.id} /> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <div className="space-y-6">
          <DemoActions onDone={() => tasks.reload()} />
          <section aria-labelledby="events-title" className="rounded-[10px] border rule">
            <div className="flex items-center justify-between border-b rule px-4 py-3">
              <h2 id="events-title" className="text-[1rem] font-semibold text-coal">
                Change log
              </h2>
              <span className="flex items-center gap-2 text-[0.8rem] text-coal-3">
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${state === "open" ? "bg-signal" : "bg-coal-3"}`} />
                {state === "open" ? "Listening" : state === "connecting" ? "Connecting" : "Closed"}
              </span>
            </div>
            <ol className="max-h-[28rem] overflow-y-auto" aria-live="polite" aria-relevant="additions">
              {events.length === 0 ? (
                <li className="px-4 py-6 text-[0.9rem] text-coal-3">Quiet. Events appear here the moment the graph changes, from any client.</li>
              ) : (
                events.map((e) => (
                  <li key={e.key} className="border-b rule px-4 py-2.5 last:border-b-0" style={{ animation: "fade-in 400ms var(--ease-out-expo)" }}>
                    <p className="flex items-baseline justify-between gap-3">
                      <span className="code text-[0.76rem] font-medium text-coal">{e.event}</span>
                      <span className="t-num text-[0.76rem] text-coal-3">{fmtTime(e.ts)}</span>
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[0.84rem] text-coal-2">{summary(e.payload ?? {})}</p>
                  </li>
                ))
              )}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
