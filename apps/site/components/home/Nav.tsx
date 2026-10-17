"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { IconArrowRight } from "@/components/icons";
import { Wordmark } from "@/components/Mark";

const LINKS = [
  ["#how", "How it works"],
  ["#ask", "Ask"],
  ["#proof", "Under the hood"],
] as const;

function subscribeScroll(callback: () => void) {
  window.addEventListener("scroll", callback, { passive: true });
  return () => window.removeEventListener("scroll", callback);
}

/** Sits flat over the hero, then floats as a white pill once the page scrolls. */
export function Nav() {
  const scrolled = useSyncExternalStore(
    subscribeScroll,
    () => window.scrollY > 24,
    () => false,
  );
  return (
    <header className="fixed inset-x-0 top-0 z-40 px-3">
      <div
        className={`mx-auto flex max-w-[1240px] items-center justify-between gap-6 border transition-[margin,padding,height,background-color,border-color,box-shadow] duration-500 ease-[var(--ease-out-expo)] ${
          scrolled
            ? "mt-3 h-14 rounded-full border-[rgb(14_14_16/0.08)] bg-white/85 pl-5 pr-2 shadow-[0_12px_32px_-20px_rgb(14_14_16/0.45)] backdrop-blur-md"
            : "mt-2 h-16 rounded-full border-transparent px-3 sm:px-7"
        }`}
      >
        <Link href="/" aria-label="Helium home" className="rounded-[4px]">
          <Wordmark className="text-coal" />
        </Link>
        <nav aria-label="Sections" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {LINKS.map(([href, label]) => (
              <li key={href}>
                <a href={href} className="rounded-full px-3.5 py-2 text-[0.94rem] text-coal-2 transition-colors hover:bg-paper-2 hover:text-coal">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <Link href="/workspace" className="lp-btn lp-btn-ink lp-btn-sm group">
          Open the workspace
          <IconArrowRight size={15} className="transition-transform duration-300 group-hover:translate-x-0.5" />
        </Link>
      </div>
    </header>
  );
}
