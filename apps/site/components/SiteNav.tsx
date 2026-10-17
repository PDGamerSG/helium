"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IconArrowRight, IconClose, IconMenu } from "./icons";
import { Wordmark } from "./Mark";

const LINKS = [
  { id: "core", label: "The core" },
  { id: "any-day", label: "Any day" },
  { id: "receipts", label: "Receipts" },
  { id: "agents", label: "Crew" },
  { id: "under-the-ice", label: "Under the ice" },
];

/**
 * Transparent over the hero, then a compact floating bar. It slides away while you scroll down and returns
 * when you scroll up. A sliding marker follows the section in view; a peach line at its foot shows scroll depth.
 */
export function SiteNav() {
  const [solid, setSolid] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [marker, setMarker] = useState<{ x: number; w: number } | null>(null);
  const depth = useRef<HTMLDivElement>(null);
  const links = useRef<Record<string, HTMLAnchorElement | null>>({});
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lastY = window.scrollY;
    let raf = 0;
    let wasSolid: boolean | null = null;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const measure = (current: string | null) => {
      const el = current ? links.current[current] : null;
      const parent = list.current;
      if (!el || !parent || !parent.offsetParent) return setMarker(null);
      const a = el.getBoundingClientRect();
      const p = parent.getBoundingClientRect();
      setMarker({ x: a.left - p.left, w: a.width });
    };
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (depth.current) depth.current.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
      const isSolid = y > window.innerHeight * 0.6;
      setSolid(isSolid);
      const delta = y - lastY;
      if (Math.abs(delta) > 6) {
        setHidden(delta > 0 && y > window.innerHeight * 0.9);
        lastY = y;
      }
      // The section whose top has passed a third of the viewport is the one being read.
      let current: string | null = null;
      for (const l of LINKS) {
        const el = document.getElementById(l.id);
        if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.34) current = l.id;
      }
      setActive(current);
      measure(current);
      if (wasSolid !== null && wasSolid !== isSolid) {
        clearTimeout(settle);
        settle = setTimeout(() => measure(current), 540);
      }
      wasSolid = isSolid;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [menu]);

  return (
    <>
      <header
        className="fixed inset-x-0 top-0 z-40 transition-transform duration-500 ease-[var(--ease-out-expo)]"
        style={{ transform: hidden && !menu ? "translateY(-110%)" : "none" }}
      >
        <div
          className={`relative mx-auto flex items-center justify-between gap-6 transition-[max-width,margin,padding,background-color,border-color,border-radius,box-shadow] duration-500 ease-[var(--ease-out-expo)] ${
            solid
              ? "mt-3 h-14 max-w-[min(1120px,calc(100%-1.5rem))] rounded-[6px] border border-[rgb(148_176_214/0.16)] bg-[rgb(8_13_22/0.82)] px-4 shadow-[0_18px_40px_-24px_rgb(0_0_0/0.9)] backdrop-blur-md"
              : "mt-0 h-20 max-w-[1440px] rounded-none border border-transparent bg-transparent px-6 sm:px-10"
          }`}
        >
          <Link href="/" aria-label="Helium home" className="rounded-[2px]">
            <Wordmark />
          </Link>
          <nav aria-label="Sections" className="hidden lg:block">
            <div ref={list} className="relative flex items-center">
              {marker ? (
                <span
                  aria-hidden
                  className="absolute -bottom-[3px] h-[2px] rounded-full bg-he transition-[transform,width] duration-500 ease-[var(--ease-out-expo)]"
                  style={{ transform: `translateX(${marker.x + 12}px)`, width: Math.max(0, marker.w - 24) }}
                />
              ) : null}
              {LINKS.map((l) => (
                <a
                  key={l.id}
                  ref={(el) => {
                    links.current[l.id] = el;
                  }}
                  href={`#${l.id}`}
                  aria-current={active === l.id ? "location" : undefined}
                  className={`nav-link rounded-[2px] px-3 py-2 text-[0.92rem] transition-colors ${active === l.id ? "text-frost" : "text-rime hover:text-frost"}`}
                >
                  {l.label}
                </a>
              ))}
            </div>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/workspace" className={`btn btn-sm group ${solid ? "btn-he" : "btn-line"}`}>
              Open the workspace
              <IconArrowRight size={15} className="transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
            <button
              type="button"
              onClick={() => setMenu(true)}
              aria-label="Open menu"
              aria-expanded={menu}
              className="grid h-9 w-9 place-items-center rounded-[3px] text-frost hover:bg-g-700 lg:hidden"
            >
              <IconMenu size={20} />
            </button>
          </div>
          <div aria-hidden className={`absolute inset-x-0 bottom-0 h-[2px] overflow-hidden ${solid ? "rounded-b-[6px]" : ""}`}>
            <div ref={depth} className="h-full origin-left bg-he/80" style={{ transform: "scaleX(0)" }} />
          </div>
        </div>
      </header>

      {menu ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-50 flex flex-col bg-g-950/97 px-6 pb-10 pt-5 backdrop-blur-md lg:hidden"
          style={{ animation: "fade-in 240ms var(--ease-out-expo)" }}
        >
          <div className="flex items-center justify-between">
            <Wordmark />
            <button
              type="button"
              onClick={() => setMenu(false)}
              aria-label="Close menu"
              className="grid h-10 w-10 place-items-center rounded-[3px] text-frost hover:bg-g-700"
            >
              <IconClose size={20} />
            </button>
          </div>
          <nav aria-label="Sections" className="mt-12 flex flex-col">
            {LINKS.map((l, i) => (
              <a
                key={l.id}
                href={`#${l.id}`}
                onClick={() => setMenu(false)}
                className="border-b rule py-4 text-[1.9rem] tracking-[-0.02em] text-frost"
                style={{ fontVariationSettings: '"wdth" 110', fontWeight: 720, animation: `rise-in 600ms ${80 + i * 50}ms var(--ease-out-expo) both` }}
              >
                {l.label}
              </a>
            ))}
          </nav>
          <Link href="/workspace" className="btn btn-he mt-auto" onClick={() => setMenu(false)}>
            Open the workspace
          </Link>
        </div>
      ) : null}
    </>
  );
}
