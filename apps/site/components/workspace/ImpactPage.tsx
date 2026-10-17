"use client";

import { useMemo, useState } from "react";
import { IconArrowRight, IconCheck, IconCopy, IconDoc, IconPencil } from "@/components/icons";
import { api, ApiError, useResource, useSource } from "@/lib/api";
import { fmtDay, fmtObject, predicateLabel } from "@/lib/format";
import type { Fact, Impact, ImpactItem } from "@/lib/types";
import { useWorkspace } from "./context";
import { ReviewMark } from "./marks";
import { Empty, ErrorState, Loading } from "./states";

type Draft = { id: string; title?: string; body?: string; text?: string; created_at?: number; status?: string };
type Path = { nodes: { id: string; label: string; props: Record<string, unknown> }[]; edges: { source: string; target: string; type: string }[] };

const FILTERS = [
  { id: "all", label: "All work" },
  { id: "needs_review", label: "Needs review" },
  { id: "aligned", label: "Aligned" },
  { id: "closed", label: "Closed" },
] as const;

function AssessmentMark({ a }: { a: string }) {
  if (a === "needs_review") return <ReviewMark />;
  if (a === "aligned")
    return (
      <span className="inline-flex items-center gap-1.5 text-[0.86rem] font-semibold text-coal-2">
        <IconCheck size={15} /> Aligned
      </span>
    );
  if (a === "closed") return <span className="text-[0.86rem] font-semibold text-coal-3">Closed, kept as history</span>;
  return <span className="text-[0.86rem] font-semibold text-coal-2">Unresolved</span>;
}

/** The supersession path from the fact the work was planned against to the fact in force now. */
function chainFrom(item: ImpactItem) {
  const path = item.path as Path | undefined;
  if (!path?.nodes?.length || !item.baseline) return [];
  const byId = new Map(path.nodes.map((n) => [n.id, n]));
  const chain: { id: string; object: string }[] = [];
  let cur: string | undefined = item.baseline.id;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const node = byId.get(cur);
    chain.push({ id: cur, object: String(node?.props.object ?? (cur === item.baseline.id ? item.baseline.object : "")) });
    cur = path.edges.find((e) => e.type === "SUPERSEDES" && e.target === cur)?.source;
  }
  return chain;
}

function ItemCard({ item, onDraft }: { item: ImpactItem; onDraft: (d: Draft) => void }) {
  const { tenant, openWhy } = useWorkspace();
  const source = useSource();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const draft = item.draft as Draft | null | undefined;
  const chain = chainFrom(item);
  const b = item.baseline as Fact | null | undefined;
  const c = item.current as Fact | null | undefined;
  const changed = b && c && b.id !== c.id;

  const prepare = async () => {
    if (!c) return;
    setBusy(true);
    setError(null);
    try {
      const d = await api<Draft>(`/tenants/${tenant}/impact/${encodeURIComponent(item.id)}/draft`, { method: "POST", body: { current_fact_id: c.id } });
      onDraft(d);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The draft could not be prepared.");
    } finally {
      setBusy(false);
    }
  };

  const body = draft?.body ?? draft?.text ?? "";

  return (
    <article className="rounded-[10px] border rule bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <AssessmentMark a={item.assessment} />
          <h2 className="mt-2 text-[1.2rem] font-semibold leading-snug tracking-[-0.025em] text-coal">
            {item.title}
          </h2>
        </div>
        <p className="text-[0.9rem] text-coal-2">
          Owner <span className="font-semibold text-coal">{item.owner?.name ?? "Unassigned"}</span>
        </p>
      </div>

      {b ? (
        <div className="mt-5">
          <p className="text-[0.84rem] text-coal-3">
            Depends on {b.subject}, {predicateLabel(b.predicate)}
          </p>
          <ol className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2" aria-label="Supersession path">
            {(chain.length ? chain : [{ id: b.id, object: b.object }]).map((step, i, arr) => {
              const last = i === arr.length - 1;
              const current = changed ? last : true;
              return (
                <li key={step.id} className="flex items-center gap-2">
                  {i > 0 ? <IconArrowRight size={15} className="text-coal-3" aria-label="superseded by" /> : null}
                  <button
                    type="button"
                    onClick={() => openWhy(step.id)}
                    className={`rounded-[6px] text-[0.95rem] transition-opacity hover:opacity-80 ${current ? "mark-current" : "mark-superseded px-1"}`}
                  >
                    {fmtObject(step.object)}
                    <span className="sr-only">{current ? " (in force), open why" : " (superseded), open why"}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          {changed && c ? (
            <p className="mt-2 text-[0.84rem] text-coal-3">
              Planned against {fmtObject(b.object)} from {fmtDay(b.valid_from)}. In force since {fmtDay(c.valid_from)},{" "}
              {c.speaker?.name ? `said by ${c.speaker.name}` : ""}.
            </p>
          ) : null}
        </div>
      ) : null}

      {item.rationale ? <p className="mt-4 max-w-[62ch] text-[0.98rem] leading-relaxed text-coal-2">{item.rationale}</p> : null}
      {item.document?.title ? (
        <p className="mt-3 flex items-center gap-2 text-[0.84rem] text-coal-3">
          <IconDoc size={15} /> Dependency recorded in {item.document.title}
        </p>
      ) : null}

      {item.assessment === "needs_review" ? (
        <div className="mt-5">
          {draft ? (
            <div className="sheet p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <DraftSheetMark />
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard?.writeText(body);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[0.84rem] font-semibold text-coal hover:bg-paper-3"
                >
                  {copied ? <IconCheck size={15} /> : <IconCopy size={15} />} {copied ? "Copied" : "Copy text"}
                </button>
              </div>
              <p className="mt-3 font-semibold text-coal">Note to {item.owner?.name ?? "the owner"}</p>
              <p className="mt-2 whitespace-pre-line text-[0.94rem] leading-relaxed text-coal">{body}</p>
              <p className="mt-3 text-[0.8rem] text-coal-2">
                Saved locally{draft.created_at ? ` on ${fmtDay(draft.created_at)}` : ""}. Helium never sends it on anyone&apos;s behalf.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={prepare} disabled={busy || !c} className="btn btn-ink btn-sm">
                <IconPencil size={15} /> {busy ? "Preparing" : `Prepare a note for ${item.owner?.name ?? "the owner"}`}
              </button>
              <span className="text-[0.84rem] text-coal-3">Creates an unsent local draft{source === "sample" ? " in this browser session" : ""}.</span>
            </div>
          )}
          {error ? (
            <p role="alert" className="mt-3 text-[0.9rem] text-flag">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function DraftSheetMark() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-dashed border-coal-3 px-2 py-0.5 text-[0.82rem] font-semibold text-coal-2">
      <IconPencil size={14} /> Unsent draft
    </span>
  );
}

export function ImpactPage() {
  const { tenant } = useWorkspace();
  const impact = useResource<Impact>(`/tenants/${tenant}/impact`);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const items = useMemo(() => {
    const order: Record<string, number> = { needs_review: 0, unresolved: 1, aligned: 2, closed: 3 };
    return (impact.data?.items ?? [])
      .map((i) => (drafts[i.id] ? { ...i, draft: drafts[i.id] } : i))
      .filter((i) => filter === "all" || i.assessment === filter)
      .sort((a, b) => (order[a.assessment] ?? 9) - (order[b.assessment] ?? 9));
  }, [impact.data, filter, drafts]);

  const s = impact.data?.summary ?? {};

  return (
    <div className="mx-auto max-w-[68rem] px-5 pb-20 pt-8 sm:px-8 lg:px-12">
      <h1 className="t-h2 text-coal">Work planned on old decisions</h1>
      <p className="mt-4 max-w-[60ch] text-[1.02rem] text-coal-2">
        Each work item names the fact it was planned against. When that fact is superseded, Helium follows the chain to what is true now and flags the work for its owner.
      </p>

      {impact.data ? (
        <p className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.95rem] text-coal-2" aria-live="polite">
          <span>
            <span className="t-num font-semibold text-coal">{s.tracked ?? impact.data.items.length}</span> tracked
          </span>
          <ReviewMark>
            <span className="t-num">{s.needs_review ?? 0}</span> need review
          </ReviewMark>
          <span>
            <span className="t-num font-semibold text-coal">{s.aligned ?? 0}</span> aligned
          </span>
          <span>
            <span className="t-num font-semibold text-coal">{s.closed ?? 0}</span> closed
          </span>
        </p>
      ) : null}

      <div role="tablist" aria-label="Filter work" className="mt-8 flex w-fit flex-wrap rounded-[10px] border rule p-0.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            type="button"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-[6px] px-3 py-1.5 text-[0.88rem] transition-colors ${filter === f.id ? "bg-paper-3 font-semibold text-coal" : "text-coal-2 hover:text-coal"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className={`mt-6 space-y-4 ${impact.loading && impact.data ? "opacity-60" : ""}`}>
        {impact.error ? (
          <ErrorState error={impact.error} onRetry={impact.reload} />
        ) : !impact.data ? (
          <Loading rows={4} />
        ) : items.length === 0 ? (
          <Empty title={impact.data.items.length ? "No work in this state" : "No work items are tracked yet"}>
            {impact.data.items.length ? "Choose another filter." : "Import a dependency document with POST /work-items/import to track work against facts."}
          </Empty>
        ) : (
          items.map((i) => <ItemCard key={i.id} item={i} onDraft={(d) => setDrafts((all) => ({ ...all, [i.id]: d }))} />)
        )}
      </div>

      {impact.data?.cypher ? (
        <details className="group mt-8 rounded-[10px] border rule">
          <summary className="cursor-pointer list-none px-4 py-3 text-[0.9rem] font-semibold text-coal-2 hover:text-coal [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Show the impact query</span>
            <span className="hidden group-open:inline">Hide the impact query</span>
          </summary>
          <pre className="code max-h-96 overflow-auto border-t rule px-4 py-3 text-coal-2">
            <code>{impact.data.cypher}</code>
          </pre>
        </details>
      ) : null}
    </div>
  );
}
