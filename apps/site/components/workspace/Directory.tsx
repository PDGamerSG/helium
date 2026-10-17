"use client";

import Link from "next/link";
import { useState } from "react";
import { IconLock } from "@/components/icons";
import { Wordmark } from "@/components/Mark";
import { api, ApiError, useResource, useSource } from "@/lib/api";
import { compact } from "@/lib/format";
import type { AclProbe, Tenant } from "@/lib/types";
import { SourceBadge } from "./SourceBadge";
import { Empty, ErrorState, Loading } from "./states";

const SLUG = /^[a-z0-9][a-z0-9_]{0,57}$/;

/** A small core glyph whose bands are the team's decisions (graphite), commitments (grey) and facts (light grey). */
function MiniCore({ t }: { t: Tenant }) {
  const parts = [t.counts.decisions ?? 0, t.counts.commitments ?? 0, t.counts.facts ?? 0];
  const total = Math.max(
    1,
    parts.reduce((a, b) => a + b, 0),
  );
  const fills = ["#0e0e10", "#8c8c95", "#d4d4d8"];
  let y = 4;
  return (
    <svg width="22" height="52" viewBox="0 0 22 52" aria-hidden className="shrink-0">
      <rect x="1" y="1" width="20" height="50" rx="10" fill="#f5f5f6" stroke="rgb(14 14 16 / 0.12)" />
      {parts.map((p, i) => {
        const h = (p / total) * 44;
        const r = <rect key={i} x="4" y={y} width="14" height={Math.max(h - 1, 0)} rx="2" fill={fills[i]} />;
        y += h;
        return r;
      })}
    </svg>
  );
}

function Probe({ from, others }: { from: Tenant; others: Tenant[] }) {
  const [target, setTarget] = useState(others[0]?.slug ?? "");
  const [res, setRes] = useState<AclProbe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!others.length) return null;
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setRes(await api<AclProbe>(`/tenants/${from.slug}/acl-probe?target=${encodeURIComponent(target)}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The probe failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-4 rounded-[10px] border rule p-4">
      <div className="flex flex-wrap items-center gap-2 text-[0.9rem] text-coal-2">
        <IconLock size={16} className="text-coal-3" />
        <span>Read</span>
        <label htmlFor={`probe-${from.slug}`} className="sr-only">
          Team to read
        </label>
        <select id={`probe-${from.slug}`} value={target} onChange={(e) => setTarget(e.target.value)} className="field h-8 min-h-0 w-auto py-0 text-[0.9rem]">
          {others.map((o) => (
            <option key={o.slug} value={o.slug}>
              {o.display_name}
            </option>
          ))}
        </select>
        <span>as {from.display_name}&apos;s read-only user</span>
        <button type="button" onClick={run} disabled={busy} className="btn btn-line btn-sm ml-auto">
          {busy ? "Asking Neo4j" : "Try it"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-[0.88rem] text-flag">
          {error}
        </p>
      ) : null}
      {res ? (
        <div className="mt-3 space-y-2" aria-live="polite">
          <p className={`text-[0.92rem] font-semibold ${res.allowed ? "text-flag" : "text-coal"}`}>
            {res.allowed ? "Allowed. This should not happen across teams." : "Refused by the database server."}
          </p>
          <pre className="code overflow-x-auto rounded-[6px] bg-paper-2 px-3 py-2 text-coal-2">$ {res.command}</pre>
          {res.error ? <pre className="code whitespace-pre-wrap rounded-[6px] bg-paper-2 px-3 py-2 text-coal-3">{res.error}</pre> : null}
          {res.sample ? (
            <p className="text-[0.82rem] text-coal-3">Simulated in the offline sample with the message Neo4j returns. Connect the API to run it for real.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function NewTeam({ onCreated }: { onCreated: () => void }) {
  const source = useSource();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const valid = SLUG.test(slug) && name.trim().length > 0;
  const live = source === "live";
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        setMsg(null);
        try {
          await api<Tenant>("/tenants", { method: "POST", body: { slug, display_name: name.trim() } });
          setMsg({ ok: true, text: `Created ${name.trim()}. Its database, users and grants are ready.` });
          setSlug("");
          setName("");
          onCreated();
        } catch (err) {
          setMsg({ ok: false, text: err instanceof ApiError ? err.message : "The team could not be created." });
        } finally {
          setBusy(false);
        }
      }}
      className="rounded-[10px] border rule bg-white p-5"
    >
      <h2 className="text-[1.05rem] font-semibold text-coal">Start a new team</h2>
      <p className="mt-1 text-[0.88rem] text-coal-3">Creates a Neo4j database with change capture, the schema, a reader and a writer user, and their grants.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="team-name" className="text-[0.86rem] font-semibold text-coal-2">
            Team name
          </label>
          <input id="team-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Payments squad" className="field mt-1.5" disabled={!live} />
        </div>
        <div>
          <label htmlFor="team-slug" className="text-[0.86rem] font-semibold text-coal-2">
            Short name
          </label>
          <input
            id="team-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="payments"
            className="field mt-1.5"
            aria-describedby="slug-help"
            aria-invalid={slug.length > 0 && !SLUG.test(slug)}
            disabled={!live}
          />
          <p id="slug-help" className={`mt-1.5 text-[0.8rem] ${slug && !SLUG.test(slug) ? "text-flag" : "text-coal-3"}`}>
            Lowercase letters, numbers and underscores. The database becomes team-{slug ? slug.replace(/_/g, "-") : "name"}.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!valid || busy || !live} className="btn btn-ink btn-sm">
          {busy ? "Creating" : "Create team"}
        </button>
        {!live ? <span className="text-[0.84rem] text-coal-3">Needs the Helium API. The sample is read-only.</span> : null}
      </div>
      {msg ? (
        <p role="status" className={`mt-3 text-[0.9rem] ${msg.ok ? "text-coal" : "text-flag"}`}>
          {msg.text}
        </p>
      ) : null}
    </form>
  );
}

export function Directory() {
  const tenants = useResource<Tenant[]>("/tenants");
  const source = useSource();
  const [probing, setProbing] = useState<string | null>(null);

  return (
    <div className="min-h-[100svh] bg-white">
      <header className="border-b rule bg-white">
        <div className="mx-auto flex h-16 max-w-[76rem] items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="Helium home" className="rounded-[6px]">
            <Wordmark className="text-coal" />
          </Link>
          <SourceBadge />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[76rem] px-5 pb-24 pt-14 sm:px-8">
        <h1 className="t-h2 max-w-[18ch] text-coal">Open a team&apos;s core</h1>
        <p className="mt-4 max-w-[60ch] text-[1.05rem] text-coal-2">
          Every team is its own Neo4j database. Its memory, its agents and its access rules stay inside it, and the server refuses reads from anyone else.
        </p>

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <section aria-label="Teams">
            {tenants.error ? (
              <ErrorState error={tenants.error} onRetry={tenants.reload} />
            ) : !tenants.data ? (
              <Loading rows={3} />
            ) : tenants.data.length === 0 ? (
              <Empty title="No teams yet">Create the first one, or seed the demo teams with data/seed.py.</Empty>
            ) : (
              <ul className="space-y-3">
                {tenants.data.map((t) => {
                  const sampleOnly = source === "sample" && t.slug !== "orbit";
                  return (
                    <li key={t.slug} className="rounded-[10px] border rule bg-white p-5">
                      <div className="flex flex-wrap items-start gap-5">
                        <MiniCore t={t} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-3">
                            <h2 className="text-[1.3rem] font-semibold tracking-[-0.035em] text-coal">
                              {t.display_name}
                            </h2>
                            <span className="code text-[0.74rem] text-coal-3">{t.graph}</span>
                          </div>
                          <dl className="mt-3 grid grid-cols-3 gap-x-4 gap-y-2 text-[0.88rem] sm:grid-cols-6">
                            {(
                              [
                                ["Meetings", t.counts.meetings],
                                ["Threads", t.counts.threads],
                                ["Episodes", t.counts.episodes],
                                ["Decisions", t.counts.decisions],
                                ["Commitments", t.counts.commitments],
                                ["Facts", t.counts.facts],
                              ] as [string, number | undefined][]
                            ).map(([k, v]) => (
                              <div key={k}>
                                <dt className="text-[0.78rem] text-coal-3">{k}</dt>
                                <dd className="t-num font-semibold text-coal">{v ?? 0}</dd>
                              </div>
                            ))}
                          </dl>
                          <p className="t-num mt-3 text-[0.82rem] text-coal-3">
                            {compact(t.nodes)} nodes and {compact(t.edges)} relationships. Users {t.acl.ro_user} and {t.acl.rw_user}.
                          </p>
                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            {sampleOnly ? (
                              <span className="mark-draft text-[0.84rem]">Needs the live API</span>
                            ) : (
                              <Link href={`/workspace/${t.slug}`} className="btn btn-ink btn-sm">
                                Open {t.display_name}
                              </Link>
                            )}
                            <button
                              type="button"
                              onClick={() => setProbing(probing === t.slug ? null : t.slug)}
                              aria-expanded={probing === t.slug}
                              className="btn btn-line btn-sm"
                            >
                              Test isolation
                            </button>
                          </div>
                          {probing === t.slug ? <Probe from={t} others={tenants.data!.filter((o) => o.slug !== t.slug)} /> : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <div>
            <NewTeam onCreated={tenants.reload} />
          </div>
        </div>
      </main>
    </div>
  );
}
