"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { ScanReveal } from "@/components/ScanReveal";

const RULES: [string, string][] = [
  ["Nothing melts", "A superseded fact gets an end date and a link to what replaced it. It is never deleted."],
  ["Every layer has a date", "Each fact carries when it became true and when it stopped, so any day can be read back exactly."],
  ["Every bubble is a source", "Each fact keeps the utterance or the email it came from, with the speaker and the moment."],
];

/** A real core, read like a line scan: the strip pans as the section scrolls through the viewport. */
export function RealIce() {
  const band = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = band.current;
      const s = strip.current;
      if (!el || !s) return;
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (window.innerHeight - r.top) / (window.innerHeight + r.height)));
      const overflow = s.scrollWidth - el.clientWidth;
      s.style.transform = `translate3d(${(-overflow * p).toFixed(1)}px, 0, 0)`;
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
    <section id="real-ice" aria-labelledby="real-ice-title" className="relative overflow-hidden border-t rule bg-g-900">
      <div className="mx-auto max-w-[1440px] px-6 pt-32 sm:px-10 lg:px-24">
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end lg:gap-16">
          <ScanReveal>
            <h2 id="real-ice-title" className="t-h2 max-w-[17ch] text-frost">
              Real ice keeps a year in every layer.
            </h2>
          </ScanReveal>
          <p className="max-w-[36rem] text-[1.08rem] leading-relaxed text-rime lg:justify-self-end">
            This is a section of the GISP2 core from Greenland. Each light and dark pair is one year of snow, and scientists can read it back because nothing in it was
            ever overwritten. Helium keeps a team&apos;s record the same way, one day per layer.
          </p>
        </div>
      </div>

      <figure className="mt-16">
        <div ref={band} className="relative overflow-hidden border-y rule bg-black">
          <div ref={strip} className="relative h-[clamp(9rem,17vw,15rem)] w-[max(190vw,1800px)] will-change-transform">
            <Image
              src="/images/gisp2-core-1837m.webp"
              alt="A backlit section of the GISP2 ice core, lit from behind on black, with about 38 pale and dark annual bands running across it."
              fill
              sizes="190vw"
              className="object-cover [filter:grayscale(1)_contrast(1.18)_brightness(1.05)]"
              priority={false}
            />
            <div aria-hidden className="absolute inset-0 bg-[#8fe3ff] opacity-30 mix-blend-color" />
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-[rgb(238_243_249/0.85)] shadow-[0_0_0_1px_rgb(143_227_255/0.25)]" />
          <span
            className="t-num pointer-events-none absolute left-4 top-3 text-[0.8rem] font-semibold text-frost/90 sm:left-6"
            style={{ fontVariationSettings: '"wdth" 88' }}
          >
            1,837 m
          </span>
          <span
            className="t-num pointer-events-none absolute right-4 top-3 text-[0.8rem] font-semibold text-frost/90 sm:right-6"
            style={{ fontVariationSettings: '"wdth" 88' }}
          >
            1,838 m
          </span>
        </div>
        <figcaption className="mx-auto max-w-[1440px] px-6 pt-4 text-[0.86rem] text-slate sm:px-10 lg:px-24">
          GISP2, Greenland, 1,837 to 1,838 metres deep: about 38 years of snow, laid down roughly 16,250 years ago. Photo: USGS National Ice Core Laboratory, public
          domain. Shown in greyscale with a blue tint.
        </figcaption>
      </figure>

      <div className="mx-auto grid max-w-[1440px] gap-12 px-6 pb-28 pt-20 sm:px-10 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:px-24">
        <figure>
          <div className="relative aspect-[3/2] overflow-hidden rounded-[3px] border rule">
            <Image
              src="/images/eastgrip-core-tray.webp"
              alt="A freshly cut, translucent ice core resting in an aluminium tray in a lab, its round cut face toward the camera."
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover [filter:saturate(0.55)_contrast(1.05)]"
            />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[rgb(8_13_22/0.55)] via-transparent to-transparent" />
          </div>
          <figcaption className="mt-3 text-[0.86rem] text-slate">
            A freshly cut EastGRIP core in its tray. Photo: Helle Astrid Kjær,{" "}
            <a href="https://creativecommons.org/licenses/by/4.0/" className="underline decoration-[rgb(148_176_214/0.4)] underline-offset-4 hover:text-rime">
              CC BY 4.0
            </a>
            , via Wikimedia Commons. Resized and desaturated.
          </figcaption>
        </figure>
        <div>
          <h3 className="t-h3 text-frost">What Helium borrows from the ice</h3>
          <dl className="mt-6 border-t rule">
            {RULES.map(([k, v]) => (
              <div key={k} className="border-b rule py-5">
                <dt className="text-[1.08rem] font-semibold text-frost">{k}</dt>
                <dd className="mt-1.5 max-w-[34rem] text-rime">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
