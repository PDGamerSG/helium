"use client";

import { useState } from "react";
import { IconMail, IconMic } from "@/components/icons";

export type ReceiptSource = { quote: string; speaker: string; where: string; when: string; kind: "meeting" | "email"; factId: string };
export type ReceiptPart = string | { cite: number };
export type Receipt = {
  question: string;
  parts: ReceiptPart[];
  sources: ReceiptSource[];
  route: string;
  cypher: string;
  asOf: string;
  replaced?: { value: string; until: string }[];
  empty?: { searched: string };
};

export function Receipts({ receipts }: { receipts: Receipt[] }) {
  const [q, setQ] = useState(0);
  const [cite, setCite] = useState(1);
  const r = receipts[q];

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14">
      <div>
        <div role="tablist" aria-label="Questions" className="flex flex-col border-t rule">
          {receipts.map((item, i) => (
            <button
              key={item.question}
              role="tab"
              type="button"
              id={`receipt-tab-${i}`}
              aria-selected={q === i}
              aria-controls="receipt-panel"
              onClick={() => {
                setQ(i);
                setCite(1);
              }}
              className={`group flex items-center justify-between gap-4 border-b rule py-4 text-left text-[1.08rem] transition-colors ${q === i ? "text-frost" : "text-slate hover:text-rime"}`}
            >
              <span className={q === i ? "font-semibold" : ""}>{item.question}</span>
              <span
                aria-hidden
                className={`h-2 w-2 shrink-0 rounded-full transition-colors ${q === i ? "bg-he" : "bg-transparent ring-1 ring-[rgb(148_176_214/0.35)]"}`}
              />
            </button>
          ))}
        </div>

        <div id="receipt-panel" role="tabpanel" aria-labelledby={`receipt-tab-${q}`} className="mt-9">
          <p className="text-[1.34rem] leading-[1.6] tracking-[-0.005em] text-frost" style={{ fontVariationSettings: '"wdth" 100' }}>
            {r.parts.map((part, i) =>
              typeof part === "string" ? (
                <span key={i}>{part}</span>
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCite(part.cite)}
                  onMouseEnter={() => setCite(part.cite)}
                  onFocus={() => setCite(part.cite)}
                  aria-label={`Show source ${part.cite}`}
                  aria-pressed={cite === part.cite}
                  className={`t-num mx-[0.15em] inline-grid h-[1.35em] min-w-[1.35em] -translate-y-[0.12em] place-items-center rounded-[2px] px-1 align-middle text-[0.72em] font-bold transition-colors ${
                    cite === part.cite ? "bg-he text-he-ink" : "bg-[rgb(255_174_138/0.12)] text-he hover:bg-[rgb(255_174_138/0.22)]"
                  }`}
                >
                  {part.cite}
                </button>
              ),
            )}
          </p>
          <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-[0.92rem] text-rime">
            <span className="rounded-[2px] border border-[rgb(143_227_255/0.35)] px-2 py-0.5 text-ice">As of {r.asOf}</span>
            {r.replaced?.length ? (
              <>
                <span className="text-slate">Earlier answers kept on record:</span>
                {r.replaced.map((x) => (
                  <span key={x.value}>
                    <span className="mark-superseded">{x.value}</span> <span className="text-slate">until {x.until}</span>
                  </span>
                ))}
              </>
            ) : null}
          </p>
          <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-[0.92rem]">
            <dt className="text-slate">Route</dt>
            <dd className="text-rime">{r.route}</dd>
            {r.empty ? (
              <>
                <dt className="text-slate">Searched</dt>
                <dd className="text-rime">{r.empty.searched}</dd>
              </>
            ) : (
              <>
                <dt className="text-slate">Sources</dt>
                <dd className="text-rime">
                  {r.sources.length} {r.sources.length === 1 ? "utterance or email" : "utterances and emails"}, each opening the original
                </dd>
              </>
            )}
          </dl>
          <details className="group mt-6 rounded-[3px] border rule">
            <summary className="cursor-pointer list-none px-4 py-3 text-[0.92rem] font-semibold text-rime transition-colors hover:text-frost [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Show the Cypher that ran</span>
              <span className="hidden group-open:inline">Hide the Cypher</span>
            </summary>
            <pre className="code max-h-72 overflow-auto border-t rule px-4 py-4 text-rime">
              <code>{r.cypher}</code>
            </pre>
          </details>
        </div>
      </div>

      <div aria-label="Sources" className="relative">
        {r.empty ? (
          <div className="flex h-full min-h-[18rem] flex-col justify-center rounded-[3px] border border-dashed border-[rgb(148_176_214/0.35)] p-8">
            <p className="t-h3 text-frost">No receipt, no answer.</p>
            <p className="mt-3 max-w-[28rem] text-rime">
              When nothing in the record supports a claim, Helium says so and shows what it searched. It never fills the gap with a likely-sounding guess.
            </p>
          </div>
        ) : (
          <ol className="space-y-3">
            {r.sources.map((s, i) => {
              const on = cite === i + 1;
              return (
                <li key={s.factId}>
                  <button
                    type="button"
                    onClick={() => setCite(i + 1)}
                    aria-pressed={on}
                    className={`block w-full rounded-[3px] p-5 text-left transition-[background-color,color,box-shadow,transform] duration-300 ${
                      on ? "sheet" : "border border-[rgb(148_176_214/0.18)] bg-g-800 text-rime hover:border-[rgb(148_176_214/0.4)]"
                    }`}
                    style={{ transform: on ? "translateX(-6px)" : "none" }}
                  >
                    <span className={`flex items-center justify-between gap-4 text-[0.84rem] ${on ? "text-ink-soft" : "text-slate"}`}>
                      <span className="flex items-center gap-2">
                        <span
                          className={`t-num grid h-5 min-w-5 place-items-center rounded-[2px] px-1 text-[0.75rem] font-bold ${on ? "bg-he text-he-ink" : "bg-[rgb(255_174_138/0.12)] text-he"}`}
                        >
                          {i + 1}
                        </span>
                        {s.kind === "email" ? <IconMail size={15} /> : <IconMic size={15} />}
                        <span className={`font-semibold ${on ? "text-ink" : "text-frost"}`}>{s.where}</span>
                      </span>
                      <span className="t-num whitespace-nowrap">{s.when}</span>
                    </span>
                    <span className={`t-quote mt-3 block text-[1.12rem] leading-[1.5] ${on ? "text-ink" : "text-rime"}`}>
                      <span className={`not-italic font-sans text-[0.86rem] font-semibold ${on ? "text-ink-soft" : "text-slate"}`}>{s.speaker}: </span>“{s.quote}”
                    </span>
                    <span className={`code mt-3 block text-[0.72rem] ${on ? "text-ink-soft" : "text-slate"}`}>{s.factId}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
