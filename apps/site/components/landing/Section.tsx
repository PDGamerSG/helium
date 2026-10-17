import Link from "next/link";
import { Wordmark } from "@/components/Mark";

type Layout = "split" | "stacked" | "reversed";

/**
 * A landing section. Three header compositions keep the rhythm from repeating:
 * split (title left, intro right), stacked (title over a narrow intro), reversed (intro left, title right).
 */
export function Section({
  id,
  title,
  intro,
  children,
  tone = "base",
  layout = "split",
}: {
  id: string;
  title: string;
  intro: React.ReactNode;
  children: React.ReactNode;
  tone?: "base" | "deep";
  layout?: Layout;
}) {
  const heading = (
    <h2 id={`${id}-title`} className={`t-h2 text-frost ${layout === "stacked" ? "max-w-[22ch]" : "max-w-[18ch]"} ${layout === "reversed" ? "lg:text-right" : ""}`}>
      {title}
    </h2>
  );
  const lede = <p className="max-w-[36rem] text-[1.08rem] leading-relaxed text-rime">{intro}</p>;
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`relative border-t rule ${tone === "deep" ? "bg-g-900" : "bg-g-800"}`}>
      <div className="mx-auto max-w-[1440px] px-6 pb-28 pt-32 sm:px-10 lg:px-24">
        {layout === "stacked" ? (
          <div className="grid gap-6">
            {heading}
            {lede}
          </div>
        ) : layout === "reversed" ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end lg:gap-16">
            <div className="order-2 lg:order-1">{lede}</div>
            <div className="order-1 lg:order-2 lg:justify-self-end">{heading}</div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end lg:gap-16">
            {heading}
            <div className="lg:justify-self-end">{lede}</div>
          </div>
        )}
        <div className="mt-16">{children}</div>
      </div>
    </section>
  );
}

export function Closing() {
  return (
    <section aria-labelledby="closing-title" className="relative overflow-hidden border-t rule bg-g-900">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-full"
        style={{ background: "radial-gradient(60% 80% at 50% 120%, rgb(255 174 138 / 0.09), transparent 70%)" }}
      />
      <div className="relative mx-auto max-w-[1440px] px-6 py-32 sm:px-10 lg:px-24">
        <h2 id="closing-title" className="t-display max-w-[15ch] text-frost">
          Now drill into Orbit yourself.
        </h2>
        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
          <p className="max-w-[38rem] text-[1.12rem] leading-relaxed text-rime">
            Orbit is the synthetic sample team behind every example on this page. The workspace reads it from the Helium API, or from a bundled snapshot when no API is
            running, and it always tells you which one you are looking at.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/workspace" className="btn btn-he">
              Open the workspace
            </Link>
            <Link href={`/workspace/orbit?ask=${encodeURIComponent("When is the UPI flow due, and why did it move?")}`} className="btn btn-line">
              Ask about the UPI flow
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

const FOOT_LINKS = [
  ["#core", "The core"],
  ["#any-day", "Any day"],
  ["#receipts", "Receipts"],
  ["#agents", "Crew"],
  ["#under-the-ice", "Under the ice"],
  ["/workspace", "Workspace"],
];

export function Footer() {
  return (
    <footer className="border-t rule bg-g-950">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-10 px-6 py-14 sm:px-10 lg:flex-row lg:items-start lg:justify-between lg:px-24">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-[26rem] text-[0.95rem] text-slate">Memory with a trail, for teams and their agents. Built on Neo4j.</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-12 gap-y-2 sm:grid-cols-3">
          {FOOT_LINKS.map(([href, label]) =>
            href.startsWith("/") ? (
              <Link key={href} href={href} className="text-[0.95rem] text-rime hover:text-frost">
                {label}
              </Link>
            ) : (
              <a key={href} href={href} className="text-[0.95rem] text-rime hover:text-frost">
                {label}
              </a>
            ),
          )}
        </nav>
      </div>
      <div className="mx-auto max-w-[1440px] border-t rule px-6 py-6 text-[0.86rem] text-slate sm:px-10 lg:px-24">
        Every example on this page comes from the synthetic Orbit corpus in the repository&apos;s data folder: six meetings and five email threads.
      </div>
    </footer>
  );
}
