"use client";

import Link from "next/link";
import { useState } from "react";
import { IconMail, IconMic } from "@/components/icons";
import { useResource } from "@/lib/api";
import { fmtDate, fmtDay, fmtObject, fmtOffset, fmtTime, predicateLabel } from "@/lib/format";
import type { Why } from "@/lib/types";
import { useWorkspace } from "./context";
import { KIND_LABEL, StatusMark } from "./marks";
import { ErrorState, Loading } from "./states";

function needleRe(value: string) {
  const needles = [value, fmtObject(value)].filter((v) => v && v.length > 2);
  const day = /^\d{4}-\d{2}-(\d{2})$/.exec(value)?.[1];
  if (day) needles.push(`${Number(day)}th`, `${Number(day)}st`, `${Number(day)}nd`, `${Number(day)}rd`);
  return needles.length ? new RegExp(`(${needles.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi") : null;
}

/** The paragraph of a long message that carries the value, so the reason is visible without expanding. */
function excerpt(text: string, value: string) {
  const re = needleRe(value);
  const paras = text.split(/\n{2,}/);
  const i = re ? paras.findIndex((p) => new RegExp(re.source, "i").test(p)) : -1;
  return i >= 0 ? paras[i] : paras.slice(0, 2).join("\n\n");
}

/** Highlights the object value inside the source text when it appears there. */
function Highlighted({ text, value }: { text: string; value: string }) {
  const re = needleRe(value);
  if (!re) return <>{text}</>;
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-[10px] bg-[#ffe0cf] px-0.5 text-coal">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function Provenance({ why }: { why: Why }) {
  const n = why.node;
  const around: { label: string; name: string; tone?: "old" | "src" }[] = [];
  if (why.episode) around.push({ label: "Episode", name: why.source?.kind === "email" ? "email" : `at ${fmtOffset(why.episode.t_start)}`, tone: "src" });
  if (why.speaker) around.push({ label: "Person", name: why.speaker.name });
  if (why.meeting) around.push({ label: "Meeting", name: why.meeting.title, tone: "src" });
  if (why.thread) around.push({ label: "EmailThread", name: why.thread.subject, tone: "src" });
  for (const e of (why.entities ?? []).slice(0, 2)) around.push({ label: "Entity", name: e.name });
  for (const f of why.supersedes.slice(0, 2)) around.push({ label: "Fact", name: fmtObject(f.object), tone: "old" });
  const W = 430;
  const H = 230;
  const cx = W / 2;
  const cy = H / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`The fact and the ${around.length} nodes connected to it in the graph.`}>
      {around.map((a, i) => {
        const ang = (i / around.length) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(ang) * 148;
        const y = cy + Math.sin(ang) * 82;
        return (
          <g key={i}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke={a.tone === "old" ? "#8c8c95" : "rgb(14 14 16 / 0.18)"} strokeDasharray={a.tone === "old" ? "4 3" : undefined} />
            <g transform={`translate(${x} ${y})`}>
              <rect x={-58} y={-17} width={116} height={34} rx={8} fill="#fff" stroke={a.tone === "old" ? "rgb(14 14 16 / 0.28)" : "rgb(14 14 16 / 0.14)"} strokeDasharray={a.tone === "old" ? "3 3" : undefined} />
              <text y={-3} textAnchor="middle" fontSize={9.5} fill="#75757e" style={{ fontFamily: "var(--font-jetbrains)" }}>
                {a.label}
              </text>
              <text
                y={10}
                textAnchor="middle"
                fontSize={11}
                fill={a.tone === "old" ? "#8c8c95" : "#0e0e10"}
                textDecoration={a.tone === "old" ? "line-through" : undefined}
              >
                {a.name.length > 18 ? `${a.name.slice(0, 17)}…` : a.name}
              </text>
            </g>
          </g>
        );
      })}
      <g transform={`translate(${cx} ${cy})`}>
        <rect x={-62} y={-20} width={124} height={40} rx={9} fill="#fff0e8" stroke="rgb(255 90 31 / 0.45)" />
        <text y={-4} textAnchor="middle" fontSize={9.5} fill="#b4380b" style={{ fontFamily: "var(--font-jetbrains)" }}>
          {KIND_LABEL[n.kind] ?? "Fact"}
        </text>
        <text y={11} textAnchor="middle" fontSize={12} fontWeight={700} fill="#b4380b">
          {fmtObject(n.object).length > 16 ? `${fmtObject(n.object).slice(0, 15)}…` : fmtObject(n.object)}
        </text>
      </g>
    </svg>
  );
}

export function WhyPanel({ id }: { id: string }) {
  const { tenant, openWhy } = useWorkspace();
  const why = useResource<Why>(`/tenants/${tenant}/why/${encodeURIComponent(id)}`);
  const [full, setFull] = useState(false);

  if (why.error)
    return (
      <div className="p-5">
        <ErrorState error={why.error} onRetry={why.reload} />
      </div>
    );
  if (!why.data)
    return (
      <div className="p-5">
        <Loading rows={5} />
      </div>
    );

  const w = why.data;
  const n = w.node;
  const email = w.source?.kind === "email" || Boolean(w.thread);
  const container = w.meeting?.title ?? w.thread?.subject ?? w.source?.container?.title ?? w.source?.container?.subject ?? "Source";
  const containerId = w.meeting?.id ?? w.thread?.id ?? w.source?.container?.id;
  const when = email
    ? w.source?.sent_at
      ? `${fmtDay(w.source.sent_at)}, ${fmtTime(w.source.sent_at)}`
      : fmtDay(n.valid_from)
    : `${fmtDay(n.valid_from)}, at ${fmtOffset(w.episode?.t_start ?? w.source?.t_start)}`;
  const text = w.episode?.text ?? n.text;
  const long = text.length > 520;
  const history = w.history.length ? w.history : [n];

  return (
    <div className="space-y-7 p-5">
      <section>
        <p className="text-[0.84rem] text-coal-3">
          {KIND_LABEL[n.kind] ?? "Fact"}, {n.subject}, {predicateLabel(n.predicate)}
        </p>
        <p className="mt-1.5 text-[1.8rem] font-semibold leading-[1.1] tracking-[-0.04em] text-coal">
          {fmtObject(n.object)}
        </p>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.9rem] text-coal-2">
          <StatusMark fact={n} />
          <span>{n.valid_to ? `From ${fmtDay(n.valid_from)} to ${fmtDay(n.valid_to)}` : `Since ${fmtDate(n.valid_from)}`}</span>
          {n.confidence != null ? <span className="text-coal-3">Confidence {Math.round(n.confidence * 100)}%</span> : null}
        </p>
      </section>

      <section aria-label="Source">
        <div className="sheet p-4">
          <p className="flex items-center justify-between gap-3 text-[0.84rem] text-coal-2">
            <span className="flex min-w-0 items-center gap-2">
              {email ? <IconMail size={15} /> : <IconMic size={15} />}
              <span className="truncate font-semibold text-coal">{email ? `Email, “${container}”` : container}</span>
            </span>
            <span className="t-num shrink-0">{when}</span>
          </p>
          {email && w.speaker ? <p className="mt-2 text-[0.84rem] text-coal-2">From {w.speaker.name}</p> : null}
          <p className="t-quote mt-3 whitespace-pre-line text-[1.05rem] leading-[1.55] text-coal">
            {!email && w.speaker ? <span className="font-sans text-[0.84rem] font-semibold not-italic text-coal-2">{w.speaker.name}: </span> : null}
            {long && !full ? "… " : null}
            <Highlighted text={long && !full ? excerpt(text, n.object) : text} value={n.object} />
            {long && !full ? " …" : null}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.86rem]">
            {long ? (
              <button
                type="button"
                onClick={() => setFull((f) => !f)}
                className="font-semibold text-coal underline decoration-[rgb(14_14_16/0.3)] underline-offset-4 hover:decoration-coal"
              >
                {full ? "Show less" : "Show the whole message"}
              </button>
            ) : null}
            {containerId ? (
              <Link
                href={`/workspace/${tenant}/sources?open=${encodeURIComponent(containerId)}${w.episode ? `&at=${encodeURIComponent(w.episode.id)}` : ""}`}
                className="font-semibold text-coal underline decoration-[rgb(14_14_16/0.3)] underline-offset-4 hover:decoration-coal"
              >
                Open the {email ? "thread" : "transcript"}
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section aria-label="History">
        <h3 className="text-[0.92rem] font-semibold text-coal">History of this value</h3>
        <ol className="mt-3 border-l border-[rgb(14_14_16/0.12)]">
          {history.map((h) => {
            const isThis = h.id === n.id;
            const active = h.status === "active" && h.valid_to === null;
            return (
              <li key={h.id} className="relative pb-4 pl-5 last:pb-0">
                <span aria-hidden className={`absolute -left-[5px] top-1.5 h-[9px] w-[9px] rounded-full ${active ? "bg-signal" : "border border-coal-3 bg-white"}`} />
                <button type="button" onClick={() => !isThis && openWhy(h.id)} disabled={isThis} className="text-left disabled:cursor-default">
                  <span className={`text-[1.02rem] font-semibold ${active ? "text-coal" : "mark-superseded"}`}>{fmtObject(h.object)}</span>
                  <span className="mt-0.5 block text-[0.86rem] text-coal-3">
                    {h.valid_to ? `${fmtDay(h.valid_from)} to ${fmtDay(h.valid_to)}` : `Since ${fmtDay(h.valid_from)}`}
                    {isThis ? ", shown above" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        {history.length === 1 ? <p className="mt-2 text-[0.86rem] text-coal-3">Nothing has superseded this value.</p> : null}
      </section>

      <section aria-label="Graph neighbourhood">
        <h3 className="text-[0.92rem] font-semibold text-coal">In the graph</h3>
        <div className="mt-3 rounded-[10px] border rule bg-white p-2">
          <Provenance why={w} />
        </div>
      </section>

      <details className="group rounded-[10px] border rule">
        <summary className="cursor-pointer list-none px-4 py-3 text-[0.9rem] font-semibold text-coal-2 hover:text-coal [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Show the Cypher</span>
          <span className="hidden group-open:inline">Hide the Cypher</span>
        </summary>
        <pre className="code max-h-80 overflow-auto border-t rule px-4 py-3 text-coal-2">
          <code>{w.cypher}</code>
        </pre>
      </details>
      <p className="code text-[0.72rem] text-coal-3">{n.id}</p>
    </div>
  );
}
