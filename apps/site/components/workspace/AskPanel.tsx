"use client";

import { useEffect, useRef, useState } from "react";
import { IconMail, IconMic, IconSend } from "@/components/icons";
import { api, ApiError, useSource } from "@/lib/api";
import { fmtDay, fmtOffset, fmtTime } from "@/lib/format";
import type { ChatResponse } from "@/lib/types";
import { useWorkspace, type Turn } from "./context";

const SUGGESTIONS: Record<string, string[]> = {
  orbit: ["When is the UPI flow due, and why did it move?", "Which payment provider do we use?", "Who owns offline mode?", "What did we decide about navigation?"],
  default: ["What changed in the last week?", "Which decisions were reversed?", "What commitments are still open?", "Who owns what?"],
};

/** Renders an answer, turning [fact_id] citations into numbered buttons that open the Why panel. */
function Answer({ res }: { res: ChatResponse }) {
  const { openWhy } = useWorkspace();
  const order: string[] = [];
  const parts = res.answer.split(/(\[[a-z0-9_:-]+\])/gi);
  return (
    <p className="whitespace-pre-line text-[1.02rem] leading-[1.65] text-coal">
      {parts.map((part, i) => {
        const m = /^\[([a-z0-9_:-]+)\]$/i.exec(part);
        if (!m) return <span key={i}>{part}</span>;
        const id = m[1];
        if (!order.includes(id)) order.push(id);
        const n = order.indexOf(id) + 1;
        return (
          <button
            key={i}
            type="button"
            onClick={() => openWhy(id)}
            aria-label={`Open source ${n}, ${id}`}
            className="t-num mx-[0.15em] inline-grid h-[1.4em] min-w-[1.4em] -translate-y-[0.1em] place-items-center rounded-[5px] bg-paper-2 px-1 align-middle text-[0.74em] font-bold text-coal-2 ring-1 ring-inset ring-[rgb(14_14_16/0.1)] transition-colors hover:bg-coal hover:text-white"
          >
            {n}
          </button>
        );
      })}
    </p>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  const { openWhy } = useWorkspace();
  const r = turn.res;
  return (
    <article className="border-b rule pb-7">
      <p className="text-[1.05rem] font-semibold text-coal">{turn.q}</p>
      {turn.error ? (
        <p role="alert" className="mt-3 text-[0.95rem] text-flag">
          {turn.error}
        </p>
      ) : !r ? (
        <div role="status" className="mt-4 space-y-2">
          <span className="sr-only">Searching the record</span>
          <div className="h-3 w-3/4 animate-pulse rounded bg-[rgb(14_14_16/0.07)]" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-[rgb(14_14_16/0.07)]" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-[rgb(14_14_16/0.07)]" />
        </div>
      ) : (
        <div className="mt-3 space-y-5">
          <Answer res={r} />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[0.84rem]">
            <dt className="text-coal-3">Route</dt>
            <dd className="text-coal-2">
              {r.router.intent}, {r.router.route}
              {r.router.template ? `, ${r.router.template}` : ""}
            </dd>
            <dt className="text-coal-3">Answered by</dt>
            <dd className="text-coal-2">
              {r.model} in {r.latency_ms} ms
            </dd>
          </dl>
          {r.sources.length ? (
            <div>
              <h4 className="text-[0.86rem] font-semibold text-coal-2">Facts cited</h4>
              <ul className="mt-2 space-y-1.5">
                {r.sources.map((s) => (
                  <li key={s.fact_id}>
                    <button
                      type="button"
                      onClick={() => openWhy(s.fact_id)}
                      className="group flex w-full items-start gap-2.5 rounded-[10px] px-2 py-1.5 text-left hover:bg-paper-2"
                    >
                      <span className="mt-0.5 text-coal-3">{s.kind === "email" ? <IconMail size={15} /> : <IconMic size={15} />}</span>
                      <span className="min-w-0">
                        <span className="block text-[0.92rem] text-coal group-hover:underline">{s.text ?? s.fact_id}</span>
                        <span className="block text-[0.8rem] text-coal-3">
                          {s.speaker}, {s.meeting ?? s.thread ?? "source"}
                          {s.valid_from ? `, ${fmtDay(s.valid_from)}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {r.episodes.length ? (
            <details className="group">
              <summary className="cursor-pointer list-none text-[0.86rem] font-semibold text-coal-2 hover:text-coal [&::-webkit-details-marker]:hidden">
                {r.episodes.length} raw {r.episodes.length === 1 ? "excerpt" : "excerpts"} read as evidence
              </summary>
              <ul className="mt-3 space-y-2">
                {r.episodes.map((e) => (
                  <li key={e.episode_id} className="rounded-[10px] border rule p-3">
                    <p className="text-[0.8rem] text-coal-3">
                      {e.speaker}, {e.meeting ?? e.thread}
                      {e.t_start != null && e.kind === "utterance" ? `, at ${fmtOffset(e.t_start)}` : e.sent_at ? `, ${fmtDay(e.sent_at)} ${fmtTime(e.sent_at)}` : ""}
                    </p>
                    <p className="t-quote mt-1 line-clamp-4 text-[0.98rem] text-coal-2">“{e.text}”</p>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {r.cypher.length ? (
            <details className="group rounded-[10px] border rule">
              <summary className="cursor-pointer list-none px-3 py-2.5 text-[0.86rem] font-semibold text-coal-2 hover:text-coal [&::-webkit-details-marker]:hidden">
                {r.cypher.length} {r.cypher.length === 1 ? "query" : "queries"} ran
              </summary>
              <div className="max-h-72 overflow-auto border-t rule">
                {r.cypher.map((c, i) => (
                  <pre key={i} className="code border-b rule px-3 py-2.5 text-coal-2 last:border-b-0">
                    <code>{c}</code>
                  </pre>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      )}
    </article>
  );
}

export function AskPanel({ initial, autoSubmit }: { initial?: string; autoSubmit: boolean }) {
  const { tenant, chatTurns: turns, setChatTurns: setTurns } = useWorkspace();
  const source = useSource();
  const [draft, setDraft] = useState(autoSubmit ? "" : (initial ?? ""));
  const busy = turns.some((turn) => !turn.res && !turn.error);
  const field = useRef<HTMLTextAreaElement>(null);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setDraft("");
    const turn: Turn = { q: question };
    setTurns((t) => [...t, turn]);
    try {
      const sessionId = [...turns].reverse().find((turn) => turn.res)?.res?.session_id;
      const res = await api<ChatResponse>(`/tenants/${tenant}/chat`, { method: "POST", body: { message: question, session_id: sessionId } });
      setTurns((t) => t.map((x) => (x === turn ? { ...x, res } : x)));
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Something went wrong asking the team.";
      setTurns((t) => t.map((x) => (x === turn ? { ...x, error: message } : x)));
    } finally {
      field.current?.focus();
    }
  };

  useEffect(() => {
    // Runs once per opened panel (the panel remounts for each new question). The timer is cleared on cleanup,
    // so React's development double-mount schedules it twice but fires it once.
    const id = setTimeout(() => {
      if (autoSubmit && initial) void ask(initial);
      else field.current?.focus();
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 space-y-7 p-5">
        {turns.length === 0 ? (
          <div>
            <p className="text-[0.95rem] text-coal-2">Answers come only from the team&apos;s record, with a source for every claim.</p>
            {source === "sample" ? (
              <p className="mt-2 text-[0.86rem] text-coal-3">Offline sample: answers use a keyword match over the Orbit facts. Connect the API to ask Guide.</p>
            ) : null}
            <ul className="mt-5 space-y-1">
              {(SUGGESTIONS[tenant] ?? SUGGESTIONS.default).map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => void ask(s)} className="w-full rounded-[10px] px-3 py-2 text-left text-[0.95rem] text-coal hover:bg-paper-2">
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          turns.map((t, i) => <TurnView key={i} turn={t} />)
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(draft);
        }}
        className="sticky bottom-0 border-t rule bg-white p-4"
      >
        <label htmlFor="ask-field" className="sr-only">
          Your question
        </label>
        <div className="relative">
          <textarea
            id="ask-field"
            ref={field}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(draft);
              }
            }}
            rows={2}
            placeholder="Ask what was decided, when it changed, or who owns it"
            className="field min-h-[3.5rem] resize-none py-3 pr-14 leading-snug"
          />
          <button type="submit" disabled={busy || !draft.trim()} aria-label="Ask" className="btn btn-ink absolute bottom-2 right-2 h-9 min-h-0 w-9 px-0">
            <IconSend size={16} />
          </button>
        </div>
        {initial && !autoSubmit && turns.length === 0 ? <p className="mt-2 text-[0.82rem] text-coal-3">Press Enter to ask.</p> : null}
      </form>
    </div>
  );
}
