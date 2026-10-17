"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconClose, IconSearch } from "@/components/icons";
import { HeliumMark } from "@/components/Mark";
import { useResource } from "@/lib/api";
import type { Tenant } from "@/lib/types";
import { AskPanel } from "./AskPanel";
import { Workspace, type Drawer, type Turn, type WorkspaceCtx } from "./context";
import { SourceBadge } from "./SourceBadge";
import { WhyPanel } from "./WhyPanel";

const NAV = [
  { href: "", label: "Memory" },
  { href: "/impact", label: "Changes" },
  { href: "/agents", label: "Crew" },
  { href: "/sources", label: "Evidence" },
];

export function Shell({ tenant, children }: { tenant: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const tenants = useResource<Tenant[]>("/tenants");
  const askParam = params.get("ask") ?? params.get("q");
  const whyParam = params.get("why");
  const [drawer, setDrawer] = useState<Drawer>(() => (askParam !== null ? { kind: "ask", question: askParam, nonce: 0 } : whyParam ? { kind: "why", id: whyParam } : null));
  const [query, setQuery] = useState(askParam ?? "");
  const [chatTurns, setChatTurns] = useState<Turn[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const base = `/workspace/${tenant}`;

  const openWhy = useCallback((id: string) => setDrawer({ kind: "why", id }), []);
  const openAsk = useCallback((question?: string) => setDrawer({ kind: "ask", question, nonce: Date.now() }), []);
  const close = useCallback(() => setDrawer(null), []);
  const ctx: WorkspaceCtx = useMemo(() => ({ tenant, drawer, openWhy, openAsk, close, chatTurns, setChatTurns }), [tenant, drawer, openWhy, openAsk, close, chatTurns]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        input.current?.focus();
      } else if (e.key === "Escape" && drawer && !typing) {
        setDrawer(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  const current = tenants.data?.find((t) => t.slug === tenant);
  const sub = pathname.slice(base.length);
  const activeNav = NAV.find((n) => (n.href === "" ? sub === "" || sub === "/" : sub.startsWith(n.href)))?.label ?? "Memory";

  return (
    <Workspace.Provider value={ctx}>
      <div className="flex h-[100svh] bg-white">
        <aside className="hidden w-[15.5rem] shrink-0 flex-col border-r rule bg-paper-2/55 md:flex">
          <div className="border-b rule px-5 pb-5 pt-5">
            <Link href="/" aria-label="Helium home" className="flex items-center gap-2 rounded-[8px] text-coal hover:text-coal-2">
              <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-coal text-white">
                <HeliumMark size={22} />
              </span>
              <span className="text-[0.95rem] font-semibold tracking-[-0.02em]">Helium</span>
            </Link>
            <label className="sr-only" htmlFor="tenant-switch">
              Workspace
            </label>
            <select
              id="tenant-switch"
              value={tenant}
              onChange={(e) => router.push(`/workspace/${e.target.value}${sub}`)}
              className="mt-5 h-10 w-full cursor-pointer truncate rounded-[9px] border rule bg-white px-3 text-[0.94rem] font-semibold text-coal hover:border-[rgb(14_14_16/0.25)]"
            >
              {(tenants.data ?? [{ slug: tenant, display_name: tenant }]).map((t) => (
                <option key={t.slug} value={t.slug} className="bg-white">
                  {t.display_name}
                </option>
              ))}
            </select>
          </div>
          <nav aria-label="Workspace" className="px-3 py-5">
            <p className="px-3 text-[0.72rem] font-semibold tracking-[0.08em] text-coal-3">WORKSPACE</p>
            <div className="mt-2 space-y-1">
              {NAV.map((n) => {
                const href = `${base}${n.href}`;
                const active = n.href === "" ? sub === "" || sub === "/" : sub.startsWith(n.href);
                return (
                  <Link
                    key={n.label}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-10 items-center rounded-[8px] px-3 text-[0.92rem] transition-colors ${active ? "bg-coal font-semibold text-white" : "text-coal-2 hover:bg-white hover:text-coal"}`}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </div>
          </nav>
          <div className="mt-auto space-y-3 border-t rule p-4">
            <SourceBadge placement="above" />
            <button type="button" onClick={() => openAsk()} className="btn btn-ink w-full">
              Ask the team
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center gap-3 border-b rule bg-white px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3 md:hidden">
              <Link href="/" aria-label="Helium home" className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-coal text-white">
                <HeliumMark size={22} />
              </Link>
              <label className="sr-only" htmlFor="tenant-switch-mobile">
                Workspace
              </label>
              <select
                id="tenant-switch-mobile"
                value={tenant}
                onChange={(e) => router.push(`/workspace/${e.target.value}${sub}`)}
                className="h-9 max-w-[8rem] cursor-pointer truncate rounded-[8px] border-transparent bg-transparent px-1 text-[0.96rem] font-semibold text-coal sm:max-w-[12rem]"
              >
                {(tenants.data ?? [{ slug: tenant, display_name: tenant }]).map((t) => (
                  <option key={t.slug} value={t.slug} className="bg-white">
                    {t.display_name}
                  </option>
                ))}
              </select>
            </div>
            <p className="hidden truncate text-[0.94rem] font-semibold text-coal md:block">{activeNav}</p>
            <div className="ml-auto flex items-center gap-2">
            <div className="md:hidden"><SourceBadge /></div>
            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                const q = query.trim();
                if (q) openAsk(q);
              }}
              className="relative hidden md:block"
            >
              <label htmlFor="ask-top" className="sr-only">
                Ask {current?.display_name ?? tenant}
              </label>
              <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-coal-3" />
              <input
                ref={input}
                id="ask-top"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Ask ${current?.display_name ?? "the team"} anything`}
                className="field h-9 min-h-0 w-[17rem] pl-9 pr-12 text-[0.92rem] lg:w-[22rem]"
                autoComplete="off"
              />
              <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-[6px] border rule px-1.5 text-[0.72rem] text-coal-3">⌘K</kbd>
            </form>
            </div>
          </header>
          <nav aria-label="Workspace" className="flex shrink-0 gap-1 overflow-x-auto border-b rule bg-white px-3 py-1.5 md:hidden">
          {NAV.map((n) => {
            const active = n.href === "" ? sub === "" || sub === "/" : sub.startsWith(n.href);
            return (
              <Link
                key={n.label}
                href={`${base}${n.href}`}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-[7px] px-3 py-2 text-[0.88rem] ${active ? "bg-paper-3 font-semibold text-coal" : "text-coal-2"}`}
              >
                {n.label}
              </Link>
            );
          })}
          <button type="button" onClick={() => openAsk()} className="ml-auto whitespace-nowrap rounded-[7px] px-3 py-2 text-[0.88rem] font-semibold text-coal">
            Ask
          </button>
          </nav>

          <div className="relative flex min-h-0 flex-1">
            <main id="main" className="min-w-0 flex-1 overflow-y-auto">
              {children}
            </main>
            {drawer ? (
            <>
              <button type="button" aria-label="Close panel" onClick={close} className="fixed inset-0 z-30 bg-[rgb(14_14_16/0.28)] xl:hidden" />
              <aside
                aria-label={drawer.kind === "why" ? "Why this fact" : "Ask"}
                className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[30rem] flex-col border-l rule bg-white xl:static xl:z-auto xl:w-[30rem]"
              >
                <div className="flex h-12 shrink-0 items-center justify-between border-b rule pl-5 pr-2">
                  <p className="text-[0.92rem] font-semibold text-coal">
                    {drawer.kind === "why" ? "Why this is in the record" : `Ask ${current?.display_name ?? tenant}`}
                  </p>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Close"
                    className="grid h-9 w-9 place-items-center rounded-[10px] text-coal-2 hover:bg-paper-2 hover:text-coal"
                  >
                    <IconClose size={16} />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {drawer.kind === "why" ? (
                    <WhyPanel key={drawer.id} id={drawer.id} />
                  ) : (
                    <AskPanel key={drawer.nonce} initial={drawer.question} autoSubmit={drawer.nonce !== 0} />
                  )}
                </div>
              </aside>
            </>
            ) : null}
          </div>
        </div>
      </div>
    </Workspace.Provider>
  );
}
