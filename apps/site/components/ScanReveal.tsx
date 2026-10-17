"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reveals a heading the way a line scanner reads an ice core: a thin cold line sweeps down and the text appears behind it.
 * Runs once, only for headings that start below the fold, and never under reduced motion. Without JavaScript the text is simply visible.
 */
export function ScanReveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "armed" | "revealed">("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;
    const arm = requestAnimationFrame(() => setState("armed"));
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState("revealed");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -18% 0px" },
    );
    io.observe(el);
    return () => {
      cancelAnimationFrame(arm);
      io.disconnect();
    };
  }, []);

  return (
    <div ref={ref} data-scan={state} className={`scan ${className}`}>
      {children}
    </div>
  );
}
