"use client";

import { useEffect, useRef, useState } from "react";
import { useResource, useSource } from "@/lib/api";
import type { Health } from "@/lib/types";

/** Says plainly whether the screen shows the live Helium API or the bundled sample. */
export function SourceBadge({ placement = "below" }: { placement?: "above" | "below" }) {
  const source = useSource();
  const [open, setOpen] = useState(false);
  const health = useResource<Health>(open ? "/health" : null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const live = source === "live";
  const label = source === "unknown" ? "Connecting" : live ? "Live API" : "Offline sample";

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-[10px] px-3 text-[0.86rem] font-semibold transition-colors ${
          live
            ? "border border-[rgb(14_14_16/0.14)] bg-white text-coal hover:border-[rgb(14_14_16/0.3)]"
            : "border border-dashed border-[rgb(14_14_16/0.25)] text-coal-2 hover:text-coal"
        }`}
      >
        <span aria-hidden className={`h-2 w-2 rounded-full ${live ? "bg-signal" : source === "unknown" ? "animate-pulse bg-coal-3" : "border border-coal-3"}`} />
        {label}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Data source"
          className={`absolute z-50 max-h-[calc(100svh-8rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-[10px] border rule bg-white p-5 shadow-[0_24px_60px_-20px_rgb(14_14_16/0.18)] ${placement === "above" ? "bottom-11 left-0" : "right-0 top-11"}`}
        >
          {live ? (
            <>
              <p className="font-semibold text-coal">Reading the Helium API</p>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[0.88rem]">
                <dt className="text-coal-3">Graph</dt>
                <dd className="text-coal-2">
                  {health.data?.neo4j
                    ? `Neo4j ${health.data.neo4j.version}, ${health.data.neo4j.databases?.length ?? 0} databases`
                    : health.loading
                      ? "Checking"
                      : "Connected"}
                </dd>
                <dt className="text-coal-3">Answers</dt>
                <dd className="text-coal-2">{health.data?.llm ? `${health.data.llm.backend}, ${health.data.llm.model}` : "Unknown"}</dd>
                <dt className="text-coal-3">Embeddings</dt>
                <dd className="text-coal-2">{health.data?.embeddings ? `${health.data.embeddings.model}, ${health.data.embeddings.dim} dims` : "Unknown"}</dd>
                <dt className="text-coal-3">Agents</dt>
                <dd className="text-coal-2">{health.data?.workers ? `${health.data.workers.length} workers running` : "Unknown"}</dd>
              </dl>
            </>
          ) : (
            <>
              <p className="font-semibold text-coal">Showing the Orbit sample</p>
              <p className="mt-2 text-[0.9rem] text-coal-2">
                No Helium API answered, so this workspace reads a read-only snapshot of the synthetic Orbit team. Actions that write to the graph are switched off.
              </p>
              <p className="mt-3 text-[0.86rem] text-coal-3">Start the API, then set HELIUM_API_URL if it isn&apos;t on port 8081:</p>
              <pre className="code mt-2 overflow-x-auto rounded-[6px] bg-paper-2 px-3 py-2 text-coal-2">uv run uvicorn apps.api.main:app --port 8081</pre>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
