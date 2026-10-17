"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { IconArrowRight } from "@/components/icons";

const NOTES: [string, string][] = [
  ["The core rail", "The team's timeline as a core. Drag the cut, click a layer, or step with the arrow keys."],
  ["What changed", "Everything superseded in the week before the cut, old value struck, new value taped."],
  ["Why it's in the record", "The original email or utterance, the value's history, its graph neighbourhood and the Cypher."],
];

/** The live workspace, tilted back like a slab on a light table, settling flat as it scrolls into view. */
export function Showcase() {
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = frame.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (window.innerHeight - r.top) / (window.innerHeight * 0.75)));
      const e = 1 - Math.pow(1 - p, 3);
      el.style.transform = `perspective(1600px) rotateX(${((1 - e) * 16).toFixed(2)}deg) translateY(${((1 - e) * 40).toFixed(1)}px) scale(${(0.94 + e * 0.06).toFixed(3)})`;
      el.style.opacity = String(0.35 + e * 0.65);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div>
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-[8%] -bottom-10 top-[30%] rounded-[50%] blur-3xl"
          style={{ background: "radial-gradient(closest-side, rgb(143 227 255 / 0.22), transparent)" }}
        />
        <div
          ref={frame}
          className="relative origin-bottom overflow-hidden rounded-[6px] border border-[rgb(148_176_214/0.22)] shadow-[0_40px_80px_-40px_rgb(0_0_0/0.9)] will-change-transform"
        >
          <Image
            src="/images/workspace-core-v2.webp"
            alt="The Helium workspace for the Orbit team on 17 September: the core rail on the left, four changes from the week before, and the Why panel showing Priya's email that moved the UPI flow to 28 September."
            width={2400}
            height={1500}
            sizes="(min-width: 1440px) 1240px, 92vw"
            className="hidden h-auto w-full sm:block"
          />
          <Image
            src="/images/workspace-why.webp"
            alt="The Why panel for the UPI flow due date: 28 September, in force since 17 September, with Priya's email sentence highlighted and the history 28, 25 and 24 September."
            width={900}
            height={1504}
            sizes="92vw"
            className="block h-auto w-full sm:hidden"
          />
        </div>
      </div>
      <div className="mt-12 grid gap-8 md:grid-cols-3">
        {NOTES.map(([k, v]) => (
          <div key={k} className="border-t rule pt-5">
            <h3 className="text-[1.08rem] font-semibold text-frost">{k}</h3>
            <p className="mt-2 text-[0.98rem] leading-relaxed text-rime">{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap items-center gap-4">
        <Link href="/workspace/orbit" className="btn btn-he group">
          Open Orbit&apos;s workspace
          <IconArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-0.5" />
        </Link>
        <p className="text-[0.92rem] text-slate">
          <span className="hidden sm:inline">Screenshot of the real workspace reading the Orbit team.</span>
          <span className="sm:hidden">The Why panel from the real workspace. Open it on a larger screen to see the core rail beside it.</span>
        </p>
      </div>
    </div>
  );
}
