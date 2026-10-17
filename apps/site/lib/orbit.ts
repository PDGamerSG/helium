import episodesJson from "./sample/episodes.json";
import factsJson from "./sample/facts.json";
import meetingsJson from "./sample/meetings.json";
import messagesJson from "./sample/messages.json";
import threadsJson from "./sample/threads.json";
import timelineJson from "./sample/timeline.json";
import whyJson from "./sample/why.json";
import cypherJson from "./sample/cypher.json";
import benchJson from "./sample/bench.json";
import { DAY, fmtDay, istDayStart } from "./format";
import type { BenchRun, Episode, Fact, Meeting, Message, Thread, Timeline, Why } from "./types";

/**
 * The landing page's story, derived at build time from the synthetic Orbit sample
 * (captured from the API's read endpoints over data/meetings and data/generator).
 */

const facts = factsJson as unknown as Fact[];
const meetings = meetingsJson as unknown as Meeting[];
const threads = threadsJson as unknown as Thread[];
const episodes = episodesJson as unknown as Record<string, Episode[]>;
const messages = messagesJson as unknown as Record<string, Message[]>;
const timeline = timelineJson as unknown as Timeline;
const why = whyJson as unknown as Record<string, Why>;

/** 7 Sep 2026 (kickoff) to 16 Oct 2026 (release day), IST. */
export const CORE_START = istDayStart(meetings[0].started_at);
export const CORE_DAYS = 40;
export const CORE_END = CORE_START + CORE_DAYS * DAY;

export type CoreLayer = {
  day: number;
  ms: number;
  label: string;
  meetings: { id: string; title: string; episodes: number }[];
  emails: { id: string; subject: string; messages: number }[];
  superseded: number;
  facts: number;
};

export type CoreBubble = { d: number; kind: "utterance" | "email"; seed: number };

export type ChainLink = {
  id: string;
  value: string;
  status: string;
  validFrom: number;
  validTo: number | null;
  day: number;
  speaker: string;
  source: string;
  sourceKind: "meeting" | "email";
  quote: string;
  offset?: number;
};

export type Chain = { key: string; label: string; links: ChainLink[] };

export type CoreData = {
  start: number;
  days: number;
  layers: CoreLayer[];
  bubbles: CoreBubble[];
  chains: Chain[];
};

const dayOf = (ms: number) => (ms - CORE_START) / DAY;

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function findQuote(meetingId: string, needle: string) {
  return episodes[meetingId]?.find((e) => e.text.includes(needle));
}

function link(id: string, override?: { quote?: string; meetingId?: string; needle?: string }): ChainLink {
  const w = why[id];
  const f = facts.find((x) => x.id === id);
  if (!w || !f) throw new Error(`missing sample fact ${id}`);
  const email = Boolean(w.thread);
  const found = override?.meetingId && override.needle ? findQuote(override.meetingId, override.needle) : undefined;
  const text = found?.text ?? override?.quote ?? w.episode?.text ?? f.text;
  return {
    id,
    value: f.object,
    status: f.status,
    validFrom: f.valid_from,
    validTo: f.valid_to,
    day: dayOf(f.valid_from),
    speaker: w.speaker?.name ?? f.speaker?.name ?? "Unknown",
    source: email ? (w.thread?.subject ?? "Email") : (w.meeting?.title ?? "Meeting"),
    sourceKind: email ? "email" : "meeting",
    quote: email ? pickSentence(text, override?.needle ?? "") : text,
    offset: found?.t_start ?? w.source?.t_start,
  };
}

/** The sentence that carries `needle`, plus the `count - 1` sentences after it: a quote short enough for a card. */
export function excerpt(text: string, needle: string, count = 1) {
  const sentences = text.replace(/\n+/g, " ").split(/(?<=[.!?])\s+/);
  const i = sentences.findIndex((s) => s.includes(needle));
  return i < 0 ? text : sentences.slice(i, i + count).join(" ");
}

/** The sentence of an email that carries the change, rather than the greeting. */
function pickSentence(text: string, needle: string) {
  const sentences = text.replace(/\n+/g, " ").split(/(?<=[.!?])\s+/);
  return sentences.find((s) => needle && s.includes(needle)) ?? sentences.find((s) => /moving|switch|supersede/i.test(s)) ?? sentences[0];
}

export function getChains(): Chain[] {
  return [
    {
      key: "upi flow|due",
      label: "UPI flow due",
      links: [
        link("fact_ep_mtg_orbit_001_020_00"),
        link("fact_ep_mtg_orbit_002_005_00", { meetingId: "mtg_orbit_002", needle: "Friday the 25th" }),
        link("fact_ep_thr_orbit_002_000_00", { needle: "Monday the 28th" }),
      ],
    },
    {
      key: "payments service|uses_vendor",
      label: "Payments vendor",
      links: [link("fact_ep_mtg_orbit_001_017_00"), link("fact_ep_mtg_orbit_005_026_00")],
    },
    {
      key: "orbit navigation|uses_pattern",
      label: "Navigation pattern",
      links: [link("fact_ep_mtg_orbit_001_035_00"), link("fact_ep_mtg_orbit_003_010_00")],
    },
  ];
}

export function getCoreData(): CoreData {
  const layers: CoreLayer[] = Array.from({ length: CORE_DAYS }, (_, day) => {
    const ms = CORE_START + day * DAY;
    return { day, ms, label: fmtDay(ms), meetings: [], emails: [], superseded: 0, facts: 0 };
  });
  const at = (ms: number) => layers[Math.min(CORE_DAYS - 1, Math.max(0, Math.floor(dayOf(ms))))];

  for (const m of meetings) at(m.started_at).meetings.push({ id: m.id, title: m.title, episodes: m.episodes });
  for (const t of threads) at(t.started_at ?? 0).emails.push({ id: t.id, subject: t.subject, messages: t.messages ?? 0 });
  for (const e of timeline.events) {
    if (e.type === "fact.superseded") at(e.t).superseded += 1;
    else if (e.type !== "meeting" && e.type !== "email") at(e.t).facts += 1;
  }

  const bubbles: CoreBubble[] = [];
  let seed = 1;
  for (const list of Object.values(episodes)) for (const ep of list) bubbles.push({ d: dayOf(ep.t_occurred), kind: "utterance", seed: hash(seed++) });
  for (const list of Object.values(messages)) for (const m of list) bubbles.push({ d: dayOf(m.sent_at), kind: "email", seed: hash(seed++) });

  return { start: CORE_START, days: CORE_DAYS, layers, bubbles, chains: getChains() };
}

export type DrillStop = {
  day: number;
  date: string;
  title: string;
  body: string;
  quote?: { text: string; who: string; where: string };
  /** State on the stop's own date: "current" means in force that day, not necessarily today. */
  marks: { value: string; state: "current" | "superseded" }[];
};

export function getDrillStops(): DrillStop[] {
  const [upi, vendor] = getChains();
  const [u24, u25, u28] = upi.links;
  const [razorpay, payu] = vendor.links;
  return [
    {
      day: CORE_DAYS - 0.5,
      date: "16 Oct",
      title: "Release day. The surface reads clean.",
      body: "Ask Helium what is true today and it answers from the top layer: the UPI flow shipped against a 28 September date, and payments run on PayU. Everything beneath is still there.",
      marks: [
        { value: "UPI flow due 28 Sep", state: "current" },
        { value: "Payments on PayU", state: "current" },
      ],
    },
    {
      day: payu.day,
      date: fmtDay(payu.validFrom),
      title: "A customer call reverses the kickoff.",
      body: "Meridian's compliance team mandates PayU. Helium records the new decision and marks Razorpay superseded, with both utterances kept.",
      quote: { text: payu.quote, who: payu.speaker, where: payu.source },
      marks: [
        { value: "PayU", state: "current" },
        { value: "Razorpay", state: "superseded" },
      ],
    },
    {
      day: u28.day,
      date: fmtDay(u28.validFrom),
      title: "An email moves a date set in a meeting.",
      body: "Priya doesn't wait for the next standup. Her email supersedes the meeting's answer, and Helium links the two across sources.",
      quote: { text: u28.quote, who: u28.speaker, where: `Email, “${u28.source}”` },
      marks: [
        { value: "28 Sep", state: "current" },
        { value: "25 Sep", state: "superseded" },
      ],
    },
    {
      day: u25.day,
      date: fmtDay(u25.validFrom),
      title: "The first slip, said out loud at standup.",
      body: "The sandbox callbacks fail, and the UPI flow moves one day. On this date the team believes the 25th. The 24th isn't deleted; it gets an end date.",
      quote: { text: u25.quote, who: u25.speaker, where: u25.source },
      marks: [
        { value: "25 Sep", state: "current" },
        { value: "24 Sep", state: "superseded" },
      ],
    },
    {
      day: u24.day,
      date: fmtDay(u24.validFrom),
      title: "Kickoff. The first layer.",
      body: "Priya commits to the 24th and the team picks Razorpay. That is the whole truth on this date. Both are replaced later, and both are still readable, dated and attributed.",
      quote: { text: u24.quote, who: u24.speaker, where: u24.source },
      marks: [
        { value: "UPI flow due 24 Sep", state: "current" },
        { value: `Payments on ${razorpay.value}`, state: "current" },
      ],
    },
  ];
}

export function getStats() {
  const ep = Object.values(episodes).reduce((n, list) => n + list.length, 0);
  const msg = Object.values(messages).reduce((n, list) => n + list.length, 0);
  return {
    meetings: meetings.length,
    threads: threads.length,
    episodes: ep,
    messages: msg,
    facts: facts.length,
    superseded: facts.filter((f) => f.status === "superseded").length,
  };
}

export function getWhySample(id: string) {
  return why[id];
}

export function getCypher() {
  return cypherJson as Record<"belief" | "why" | "recall" | "contradictions" | "claim" | "supersede", string>;
}

export function getBench() {
  return benchJson as unknown as BenchRun[];
}

/** Facts whose validity window covers at least one day of the core, for the belief scrubber. */
export function getBeliefLanes() {
  return getChains().map((chain) => ({
    key: chain.key,
    label: chain.label,
    links: chain.links.map(({ id, value, validFrom, validTo, speaker, source, sourceKind }) => ({ id, value, validFrom, validTo, speaker, source, sourceKind })),
  }));
}

/** Validity windows of every fact in the sample, for counting what was in force on a date. */
export function getAllIntervals(): [number, number | null][] {
  return facts.filter((f) => f.status !== "retracted").map((f) => [f.valid_from, f.valid_to]);
}
