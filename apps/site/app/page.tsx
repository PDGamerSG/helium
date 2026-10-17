import Link from "next/link";
import { AskDemo, type AskItem, type AskSource } from "@/components/home/AskDemo";
import { BrainDemo, type BrainStory } from "@/components/home/BrainDemo";
import { Nav } from "@/components/home/Nav";
import { IconAgent, IconArrowRight, IconLayers, IconMic } from "@/components/icons";
import { HeliumMark, Wordmark } from "@/components/Mark";
import { fmtDay, fmtObject, fmtOffset, fmtTime } from "@/lib/format";
import { excerpt, getChains, getCypher, getStats, type ChainLink } from "@/lib/orbit";

function story(): BrainStory {
  const [upi, vendor] = getChains();
  const [u24, u25, u28] = upi.links;
  const [raz, payu] = vendor.links;
  const fact = (l: ChainLink) => ({ value: fmtObject(l.value), who: l.speaker, date: fmtDay(l.validFrom), until: l.validTo ? fmtDay(l.validTo) : undefined });
  return {
    sources: [
      { title: "Kickoff", date: fmtDay(u24.validFrom), kind: "meeting" },
      { title: "Standup", date: fmtDay(u25.validFrom), kind: "meeting" },
      { title: `${u28.speaker}'s email`, date: fmtDay(u28.validFrom), kind: "email" },
      { title: "Meridian call", date: fmtDay(payu.validFrom), kind: "meeting" },
    ],
    upi: [fact(u24), fact(u25), fact(u28)],
    pay: [fact(raz), fact(payu)],
  };
}

function source(l: ChainLink, needle: string, count = 1): AskSource {
  const email = l.sourceKind === "email";
  return {
    speaker: l.speaker,
    where: email ? "Email" : l.source,
    when: email ? `${fmtDay(l.validFrom)}, ${fmtTime(l.validFrom)}` : `${fmtDay(l.validFrom)}, at ${fmtOffset(l.offset)}`,
    quote: excerpt(l.quote, needle, count),
    kind: l.sourceKind,
  };
}

function questions(): AskItem[] {
  const [upi, vendor] = getChains();
  const [u24, u25, u28] = upi.links;
  const [raz, payu] = vendor.links;
  const cypher = getCypher();
  const stats = getStats();
  return [
    {
      label: "When is the UPI flow due?",
      question: "When is the UPI flow due, and why did it move?",
      parts: [
        `${fmtObject(u28.value)}, since ${u28.speaker}'s email on ${fmtDay(u28.validFrom)}`,
        { cite: 1 },
        `. It was ${fmtObject(u24.value)} at the kickoff`,
        { cite: 2 },
        `, then ${fmtObject(u25.value)} after the sandbox callbacks failed`,
        { cite: 3 },
        ".",
      ],
      sources: [source(u28, "Monday the 28th"), source(u24, "September 24th"), source(u25, "move it to Friday", 2)],
      earlier: [
        { value: fmtObject(u24.value), until: fmtDay(u24.validTo!) },
        { value: fmtObject(u25.value), until: fmtDay(u25.validTo!) },
      ],
      cypher: cypher.why,
    },
    {
      label: "Which payment provider?",
      question: "Which payment provider are we using?",
      parts: [`${payu.value}, since the Meridian call on ${fmtDay(payu.validFrom)}`, { cite: 1 }, `. It replaced ${raz.value}, chosen at the kickoff`, { cite: 2 }, "."],
      sources: [source(payu, "Decision", 2), source(raz, "Decision")],
      earlier: [{ value: raz.value, until: fmtDay(raz.validTo!) }],
      cypher: cypher.why,
    },
    {
      label: "What does Meridian pay?",
      question: "What does Meridian pay for the pilot?",
      parts: ["Nothing in the record says."],
      sources: [],
      searched: `Helium searched ${stats.meetings} meetings and ${stats.threads} email threads and found no price, so it doesn't guess one.`,
      cypher: cypher.recall,
    },
  ];
}

const STEPS = [
  { icon: IconMic, title: "It listens", body: "Meetings, recordings and email threads. English, Hindi and Hinglish." },
  { icon: IconLayers, title: "It remembers when", body: "Every fact keeps when it became true, who said it, and what replaced it. Nothing is overwritten." },
  { icon: IconAgent, title: "It acts", body: "Agents wake the moment a fact changes and hand off the work. Drafts wait for a person." },
];

const FOOTER = [
  {
    title: "Product",
    links: [
      ["/workspace", "Workspace"],
      ["/workspace/orbit", "Orbit's memory"],
      ["/workspace/orbit/impact", "Changes"],
      ["/workspace/orbit/agents", "Crew"],
      ["/workspace/orbit/sources", "Evidence"],
    ],
  },
  {
    title: "On this page",
    links: [
      ["#how", "How it works"],
      ["#ask", "Ask Helium"],
      ["#proof", "Under the hood"],
    ],
  },
];

const STATS = [
  ["954 ops/s", "Mixed reads and writes, 20 agents across 4 teams"],
  ["18 ms", "Median read, with p99 at 43 ms"],
  ["< 1 s", "From a changed fact to the agent that cares"],
  ["1 winner", "Every time 25 agents claim the same task"],
];

export default function Home() {
  return (
    <div className="lp min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-coal focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <section aria-labelledby="hero-title">
          <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-6 pb-20 pt-28 sm:px-10 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] xl:gap-14 xl:pb-24 xl:pt-32">
            <div className="max-w-[34rem]">
              <Link href="/workspace/orbit" className="group inline-flex items-center gap-2.5 text-[0.9rem] text-coal-2 transition-colors hover:text-coal">
                <span aria-hidden className="h-2 w-2 rounded-full bg-signal" />
                Live demo on the Orbit sample team
                <IconArrowRight size={14} className="transition-transform duration-300 group-hover:translate-x-0.5" />
              </Link>
              <h1 id="hero-title" className="lp-display mt-5 text-coal">
                The company brain that remembers what changed.
              </h1>
              <p className="mt-6 max-w-[31rem] text-[1.15rem] leading-[1.55] text-coal-2">
                Meetings and email become one living memory. Ask what&apos;s true now, who said it, and what it replaced.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link href="/workspace" className="lp-btn lp-btn-ink group">
                  Open the workspace
                  <IconArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-0.5" />
                </Link>
                <a href="#how" className="lp-btn lp-btn-line">
                  How it works
                </a>
              </div>
              <p className="mt-7 text-[0.88rem] text-coal-3">Built on Neo4j, for teams and their agents.</p>
            </div>

            <div
              className="w-full max-w-[780px] rounded-[24px] bg-paper-2 p-3 ring-1 ring-inset ring-[rgb(14_14_16/0.05)] sm:p-5 xl:max-w-none"
              style={{ backgroundImage: "radial-gradient(rgb(14 14 16 / 0.07) 1px, transparent 1.2px)", backgroundSize: "16px 16px" }}
            >
              <BrainDemo story={story()} />
            </div>
          </div>
        </section>

        <section id="how" aria-labelledby="how-title" className="scroll-mt-20 border-t lp-rule">
          <div className="mx-auto grid max-w-[1240px] gap-12 px-6 py-24 sm:px-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16 lg:py-28">
            <h2 id="how-title" className="lp-h2 max-w-[17ch] text-coal">
              A meeting bot remembers a meeting. Helium remembers the team.
            </h2>
            <ol className="border-t lp-rule">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-4 border-b lp-rule py-6 sm:grid-cols-[2.25rem_12.5rem_minmax(0,1fr)] sm:gap-x-6">
                  <span className="t-num pt-[3px] text-[0.85rem] font-medium text-coal-3">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="lp-h3 flex items-start gap-2 text-coal">
                    <Icon size={17} className="mt-[2px] shrink-0 text-coal-2" />
                    {title}
                  </h3>
                  <p className="col-start-2 mt-1.5 leading-relaxed text-coal-2 sm:col-start-3 sm:mt-0">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="ask" aria-labelledby="ask-title" className="lp-dark scroll-mt-20 bg-graphite">
          <div className="mx-auto grid max-w-[1240px] gap-12 px-6 py-24 sm:px-10 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:items-center lg:gap-16 lg:py-28">
            <div>
              <p className="text-[0.9rem] font-medium text-[#8c8c95]">Ask Helium</p>
              <h2 id="ask-title" className="lp-display mt-4 max-w-[11ch] text-white">
                Answers with receipts.
              </h2>
              <p className="mt-6 max-w-[24rem] text-[1.08rem] leading-relaxed text-[#a6a6ae]">Every claim links to the moment it was said. No source, no answer.</p>
            </div>
            <AskDemo items={questions()} />
          </div>
        </section>

        <section id="proof" aria-labelledby="proof-title" className="scroll-mt-20">
          <div className="mx-auto max-w-[1240px] px-6 py-24 sm:px-10 lg:py-28">
            <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
              <h2 id="proof-title" className="lp-h2 max-w-[16ch] text-coal">
                Built on Neo4j. Measured, not promised.
              </h2>
              <p className="max-w-[30rem] leading-relaxed text-coal-2 lg:justify-self-end">
                One database per team. Agents wake from Change Data Capture. Every answer can show the Cypher behind it.
              </p>
            </div>
            <dl className="mt-12 grid gap-px overflow-hidden rounded-[16px] border lp-rule bg-[rgb(14_14_16/0.09)] sm:grid-cols-2 lg:grid-cols-4">
              {STATS.map(([value, label]) => (
                <div key={value} className="flex flex-col-reverse justify-end gap-2.5 bg-white p-6 sm:p-7">
                  <dt className="text-[0.93rem] leading-snug text-coal-2">{label}</dt>
                  <dd className="t-num text-[2.1rem] font-semibold leading-none tracking-[-0.045em] text-coal">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[0.86rem] text-coal-3">Measured on one laptop.</p>
          </div>
        </section>

        <section aria-labelledby="closing-title" className="mx-auto max-w-[1240px] px-6 sm:px-10">
          <div
            className="rounded-[24px] bg-paper-2 px-6 py-16 text-center ring-1 ring-inset ring-[rgb(14_14_16/0.05)] sm:px-12 sm:py-20"
            style={{ backgroundImage: "radial-gradient(rgb(14 14 16 / 0.07) 1px, transparent 1.2px)", backgroundSize: "16px 16px" }}
          >
            <HeliumMark size={40} className="mx-auto text-coal" />
            <h2 id="closing-title" className="lp-h2 mx-auto mt-6 max-w-[18ch] text-coal">
              See what Orbit&apos;s brain remembers.
            </h2>
            <p className="mx-auto mt-4 max-w-[32rem] leading-relaxed text-coal-2">
              Open the sample team&apos;s workspace. Go back to any day, ask a question, and open the source behind every answer.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/workspace/orbit" className="lp-btn lp-btn-ink group">
                Open Orbit&apos;s workspace
                <IconArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-0.5" />
              </Link>
              <Link href={`/workspace/orbit?ask=${encodeURIComponent("When is the UPI flow due, and why did it move?")}`} className="lp-btn lp-btn-line">
                Ask about the UPI flow
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="mt-16 border-t lp-rule sm:mt-20">
        <div className="mx-auto max-w-[1240px] px-6 pb-10 pt-14 sm:px-10">
          <div className="grid gap-10 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <Link href="/" aria-label="Helium home" className="inline-block rounded-[4px]">
                <Wordmark className="text-coal" />
              </Link>
              <p className="mt-4 max-w-[20rem] text-[0.92rem] leading-relaxed text-coal-2">
                The company brain that remembers what changed. Built on Neo4j, for teams and their agents.
              </p>
            </div>
            {FOOTER.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <p className="text-[0.86rem] font-semibold text-coal">{col.title}</p>
                <ul className="mt-3.5 space-y-2.5">
                  {col.links.map(([href, label]) => (
                    <li key={href}>
                      <Link href={href} className="text-[0.92rem] text-coal-2 transition-colors hover:text-coal">
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
          <div className="mt-14 flex flex-col gap-2 border-t lp-rule pt-6 text-[0.84rem] text-coal-3 sm:flex-row sm:items-center sm:justify-between">
            <p>Memory with a trail.</p>
            <p>Every example uses Orbit, a synthetic sample team.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
