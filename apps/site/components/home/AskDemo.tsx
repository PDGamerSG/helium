"use client";

import { useEffect, useRef, useState } from "react";
import { IconMail, IconMic } from "@/components/icons";
import { useInView, useReducedMotion } from "@/lib/hooks";

export type AskSource = { speaker: string; where: string; when: string; quote: string; kind: "meeting" | "email" };
export type AskPart = string | { cite: number };
export type AskItem = {
  label: string;
  question: string;
  parts: AskPart[];
  sources: AskSource[];
  earlier?: { value: string; until: string }[];
  /** Set when nothing in the record supports an answer: what was searched. */
  searched?: string;
  cypher: string;
};

/** A question typed into Helium and its answer, with every claim tied to the moment it was said. */
export function AskDemo({ items }: { items: AskItem[] }) {
  const [q, setQ] = useState(0);
  const [cite, setCite] = useState<number | null>(null);
  const [typed, setTyped] = useState({ q: -1, n: 0 });
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box);
  const reduced = useReducedMotion();
  const item = items[q];
  const len = item.question.length;
  const count = reduced ? len : typed.q === q ? typed.n : 0;
  const done = count >= len;

  useEffect(() => {
    if (reduced || !inView || done) return;
    const id = window.setTimeout(() => setTyped({ q, n: count + 1 }), count === 0 ? 300 : 24);
    return () => window.clearTimeout(id);
  }, [q, count, done, inView, reduced]);

  return (
    <div ref={box} className="lp-card p-5 sm:p-8">
      <div role="tablist" aria-label="Example questions" className="flex flex-wrap gap-2">
        {items.map((it, i) => (
          <button
            key={it.label}
            type="button"
            role="tab"
            id={`ask-tab-${i}`}
            aria-selected={q === i}
            aria-controls="ask-panel"
            onClick={() => {
              setQ(i);
              setCite(null);
            }}
            className={`rounded-full px-3.5 py-1.5 text-[0.88rem] transition-colors ${
              q === i ? "bg-coal text-white" : "bg-paper-2 text-coal-2 hover:bg-[#ebebee] hover:text-coal"
            }`}
          >
            {it.label}
          </button>
        ))}
      </div>

      <div id="ask-panel" role="tabpanel" aria-labelledby={`ask-tab-${q}`} className="mt-7">
        <p className="min-h-[2.4em] text-[1.45rem] xl:min-h-[1.2em] font-semibold leading-[1.2] tracking-[-0.03em] text-coal sm:text-[1.7rem]">
          <span className="sr-only">{item.question}</span>
          <span aria-hidden>
            {item.question.slice(0, count)}
            {done ? null : <span className="ml-0.5 inline-block h-[0.95em] w-[2px] translate-y-[0.12em] bg-signal" style={{ animation: "caret 1s steps(1) infinite" }} />}
          </span>
        </p>

        <div className="transition-opacity duration-500" style={{ opacity: done ? 1 : 0 }} aria-hidden={!done}>
          <p className="mt-5 text-[1.08rem] leading-relaxed text-coal">
            {item.parts.map((part, i) =>
              typeof part === "string" ? (
                <span key={i}>{part}</span>
              ) : (
                <button
                  key={i}
                  type="button"
                  onMouseEnter={() => setCite(part.cite)}
                  onFocus={() => setCite(part.cite)}
                  onClick={() => setCite(part.cite)}
                  aria-label={`Show source ${part.cite}`}
                  aria-pressed={cite === part.cite}
                  className={`t-num mx-[0.12em] inline-grid h-[1.35em] min-w-[1.35em] -translate-y-[0.1em] place-items-center rounded-[4px] px-1 align-middle text-[0.72em] font-bold transition-colors ${
                    cite === part.cite ? "bg-coal text-white" : "bg-paper-2 text-coal-2 ring-1 ring-inset ring-[rgb(14_14_16/0.1)] hover:bg-[#ebebee]"
                  }`}
                >
                  {part.cite}
                </button>
              ),
            )}
          </p>

          {item.earlier?.length ? (
            <p className="mt-3 text-[0.9rem] text-coal-2">
              Kept on record:{" "}
              {item.earlier.map((x, i) => (
                <span key={x.value}>
                  {i ? ", " : null}
                  <span className="lp-struck">{x.value}</span> until {x.until}
                </span>
              ))}
            </p>
          ) : null}

          {item.searched ? (
            <div className="mt-5 rounded-[12px] border border-dashed border-[rgb(14_14_16/0.25)] p-4 text-[0.95rem] leading-relaxed text-coal-2">
              <span className="font-semibold text-coal">No source, no answer.</span> {item.searched}
            </div>
          ) : (
            <ol className="mt-5 space-y-2">
              {item.sources.map((s, i) => {
                const Icon = s.kind === "email" ? IconMail : IconMic;
                const on = cite === i + 1;
                return (
                  <li key={s.quote} className={`flex gap-3 rounded-[12px] border p-3 transition-colors duration-300 ${on ? "border-[rgb(14_14_16/0.16)] bg-paper-2" : "border-[rgb(14_14_16/0.07)] bg-white"}`}>
                    <span
                      className={`t-num mt-0.5 grid h-5 min-w-5 shrink-0 place-items-center rounded-[4px] px-1 text-[0.72rem] font-bold ${
                        on ? "bg-coal text-white" : "bg-paper-2 text-coal-2 ring-1 ring-inset ring-[rgb(14_14_16/0.1)]"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-1.5 text-[0.82rem] text-coal-2">
                        <Icon size={13} />
                        <span className="font-semibold text-coal">{s.speaker}</span>
                        <span aria-hidden>·</span>
                        <span>{s.where}</span>
                        <span aria-hidden>·</span>
                        <span className="t-num">{s.when}</span>
                      </p>
                      <p className="mt-1 text-[0.98rem] leading-snug text-coal">“{s.quote}”</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <details className="group mt-5">
            <summary className="inline-flex cursor-pointer list-none items-center rounded-full px-1 text-[0.88rem] font-semibold text-coal-2 transition-colors hover:text-coal [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Show the Cypher that ran</span>
              <span className="hidden group-open:inline">Hide the Cypher</span>
            </summary>
            <pre className="code mt-3 max-h-64 overflow-auto rounded-[12px] bg-graphite p-4 text-[#d7d7dc]">
              <code>{item.cypher}</code>
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}
