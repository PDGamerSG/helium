import agentsJson from "./sample/agents.json";
import benchJson from "./sample/bench.json";
import contradictionsJson from "./sample/contradictions.json";
import cypherJson from "./sample/cypher.json";
import entitiesJson from "./sample/entities.json";
import episodesJson from "./sample/episodes.json";
import factsJson from "./sample/facts.json";
import healthJson from "./sample/health.json";
import impactJson from "./sample/impact.json";
import meetingsJson from "./sample/meetings.json";
import messagesJson from "./sample/messages.json";
import peopleJson from "./sample/people.json";
import skillsJson from "./sample/skills.json";
import staleJson from "./sample/stale.json";
import tenantsJson from "./sample/tenants.json";
import threadsJson from "./sample/threads.json";
import timelineJson from "./sample/timeline.json";
import whyJson from "./sample/why.json";
import type { ChatResponse, Episode, Fact, Impact, Meeting, Message, Tenant, Thread, Why } from "./types";

/**
 * A read-only stand-in for the Helium API, built from the Orbit sample. It answers the same routes with the
 * same shapes so the workspace works without a backend, and it refuses writes rather than pretending.
 */

const facts = factsJson as unknown as Fact[];
const tenants = tenantsJson as unknown as Tenant[];
const meetings = meetingsJson as unknown as Meeting[];
const threads = threadsJson as unknown as Thread[];
const episodes = episodesJson as unknown as Record<string, Episode[]>;
const messages = messagesJson as unknown as Record<string, Message[]>;
const why = whyJson as unknown as Record<string, Why>;
const impact = impactJson as unknown as Impact;
const cypher = cypherJson as Record<string, string>;

const SAMPLE_TENANT = "orbit";

type Result = { status: number; body: unknown };
const ok = (body: unknown): Result => ({ status: 200, body });
const err = (status: number, code: string, message: string): Result => ({ status, body: { error: { code, message }, detail: message } });

const drafts = new Map<string, Record<string, unknown>>();

function episodeById(id: string) {
  for (const [meetingId, list] of Object.entries(episodes)) {
    const ep = list.find((e) => e.id === id);
    if (ep) return { ep, meeting: meetings.find((m) => m.id === meetingId) };
  }
  for (const [threadId, list] of Object.entries(messages)) {
    const msg = list.find((m) => m.id === id);
    if (msg) return { msg, thread: threads.find((t) => t.id === threadId) };
  }
  return null;
}

function chainOf(f: Fact) {
  const older: Fact[] = [];
  let cur: Fact | undefined = f;
  const seen = new Set<string>();
  while (cur?.supersedes_ids?.length) {
    const prev = facts.find((x) => x.id === cur!.supersedes_ids![0]);
    if (!prev || seen.has(prev.id)) break;
    seen.add(prev.id);
    older.push(prev);
    cur = prev;
  }
  const newer: Fact[] = [];
  let next = facts.find((x) => x.supersedes_ids?.includes(f.id));
  while (next && !seen.has(next.id)) {
    seen.add(next.id);
    newer.unshift(next);
    next = facts.find((x) => x.supersedes_ids?.includes(next!.id));
  }
  return { older, newer };
}

function synthesizeWhy(f: Fact): Why {
  const found = f.source?.episode_id ? episodeById(f.source.episode_id) : null;
  const { older, newer } = chainOf(f);
  const ep = found && "ep" in found ? found.ep : undefined;
  const msg = found && "msg" in found ? found.msg : undefined;
  return {
    node: { ...f, key: `${f.subject.toLowerCase()}|${f.predicate}` },
    speaker: f.speaker ? { ...f.speaker } : null,
    meeting: found && "meeting" in found && found.meeting ? { id: found.meeting.id, title: found.meeting.title, started_at: found.meeting.started_at } : null,
    thread: found && "thread" in found && found.thread ? { id: found.thread.id, subject: found.thread.subject, started_at: found.thread.started_at } : null,
    episode: ep ? { id: ep.id, text: ep.text, t_start: ep.t_start, t_end: ep.t_end } : msg ? { id: msg.id, text: msg.text } : null,
    source: f.source ?? null,
    entities: f.entities,
    history: [...newer, f, ...older],
    supersedes: older,
    superseded_by: newer,
    cypher: cypher.why,
    subgraph: { nodes: [], edges: [] },
  };
}

function belief(t: number, entity: string | null) {
  const rows = facts.filter(
    (f) => f.status !== "retracted" && f.valid_from <= t && (f.valid_to === null || f.valid_to > t) && (!entity || f.entities?.some((e) => e.id === entity)),
  );
  return { t, entity, facts: rows, cypher: cypher.belief };
}

const STOP = new Set("a an and are at be by did do does for from how in is it its of on or the to was we what when where which who why will with".split(" "));
function terms(q: string) {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function search(q: string, k = 8) {
  const words = terms(q);
  const scored = facts
    .map((f) => {
      const hay = `${f.subject} ${f.predicate} ${f.object} ${f.text}`.toLowerCase();
      const score = words.reduce((n, w) => n + (hay.includes(w) ? (f.subject.toLowerCase().includes(w) ? 2 : 1) : 0), 0) + (f.status === "active" ? 0.5 : 0);
      return { f, score };
    })
    .filter((x) => x.score > 0.5)
    .sort((a, b) => b.score - a.score || b.f.valid_from - a.f.valid_from);
  return scored.slice(0, k);
}

function chat(message: string, sessionId?: string): ChatResponse {
  const started = Date.now();
  const hits = search(message, 6).filter((h) => h.score >= 1.5);
  const epHits: ChatResponse["episodes"] = [];
  const words = terms(message);
  for (const [meetingId, list] of Object.entries(episodes)) {
    const m = meetings.find((x) => x.id === meetingId);
    for (const ep of list) {
      const s = words.reduce((n, w) => n + (ep.text.toLowerCase().includes(w) ? 1 : 0), 0);
      if (s >= Math.max(2, Math.ceil(words.length / 2)))
        epHits.push({
          episode_id: ep.id,
          kind: "utterance",
          speaker: ep.speaker.name,
          container_id: meetingId,
          meeting: m?.title,
          t_start: ep.t_start,
          text: ep.text,
          t: ep.t_occurred,
          score: s,
        });
    }
  }
  epHits.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const lines = hits.map(({ f }) => {
    const where = f.meeting?.title ?? (f.source?.container?.subject ? `email "${f.source.container.subject}"` : "a recorded source");
    const status = f.status === "superseded" ? " (superseded)" : "";
    return `${f.text}${status} (${f.speaker?.name ?? "unknown"}, ${where}) [${f.id}]`;
  });
  const answer = lines.length
    ? `From the Orbit sample, the facts that match your question:\n\n${lines.join("\n")}`
    : "The Orbit sample has no fact that answers this. Nothing is offered without a source.";
  return {
    answer,
    session_id: sessionId ?? `sample_${started.toString(36)}`,
    router: { intent: "recall", entities: [], route: "sample", template: "keyword match over the bundled sample" },
    cypher: [cypher.recall],
    sources: hits.map(({ f }) => ({
      fact_id: f.id,
      speaker: f.speaker?.name ?? "unknown",
      kind: f.source?.kind === "email" ? "email" : "utterance",
      meeting: f.meeting?.title,
      thread: f.source?.container?.subject,
      t_start: f.source?.t_start,
      sent_at: f.source?.sent_at,
      text: f.text,
      valid_from: f.valid_from,
    })),
    episodes: epHits.slice(0, 5),
    model: "sample (no language model)",
    latency_ms: Date.now() - started,
  };
}

function prepareDraft(workId: string, currentFactId: string): Result {
  const item = impact.items.find((i) => i.id === workId);
  if (!item) return err(404, "work_not_found", "Work item not found in this team.");
  if (item.assessment !== "needs_review" || item.current?.id !== currentFactId)
    return err(409, "impact_changed", "This dependency changed or no longer needs review. Refresh the impact list.");
  const b = item.baseline!;
  const c = item.current!;
  const source = c.meeting?.title ?? c.thread?.subject ?? c.source?.container?.subject ?? "recorded source";
  const doc = item.document as { id?: string; title?: string } | null;
  const body =
    `${item.owner?.name}, please review “${item.title}”.\n\n` +
    `${b.subject} · ${b.predicate.replace(/_/g, " ")} changed from ${b.object} to ${c.object}.\n` +
    `Previous evidence: [${b.id}]. Current evidence: [${c.id}] in ${source}.\n\n` +
    `Why this work is affected: ${item.rationale}\n` +
    `Dependency recorded in ${doc?.title} [${doc?.id}].\n\n` +
    "Please confirm whether the work or its delivery plan needs updating. This is a local draft; nothing has been sent.";
  const draft = {
    id: `draft_sample_${workId}`,
    status: "draft",
    created_at: Date.now(),
    title: `Review ${item.title}`,
    body,
    work_item_id: workId,
    baseline_fact_id: b.id,
    current_fact_id: c.id,
    owner_id: item.owner?.id,
  };
  drafts.set(workId, draft);
  return ok(draft);
}

export function sampleRequest(method: string, segments: string[], search: URLSearchParams, body: unknown): Result {
  const path = segments.join("/");
  if (method === "GET" && path === "health") return ok(healthJson);
  if (method === "GET" && path === "bench/results") return ok(benchJson);
  if (path === "tenants") return method === "GET" ? ok(tenants) : err(501, "sample_read_only", "Creating a team needs the Helium API. The offline sample is read-only.");
  if (segments[0] !== "tenants" || !segments[1]) return err(404, "not_found", `No sample route for /${path}`);

  const tenant = segments[1];
  const rest = segments.slice(2);
  const t = tenants.find((x) => x.slug === tenant);
  if (!t) return err(404, "tenant_not_found", `Unknown team ${tenant}.`);
  if (rest.length === 0) return ok(t);
  if (rest[0] === "acl-probe") {
    const target = search.get("target") ?? "";
    const db = `team-${target.replace(/_/g, "-")}`;
    const user = `team_${tenant}_ro`;
    return ok({
      allowed: tenant === target,
      user,
      target_graph: db,
      command: `cypher-shell -u ${user} -d ${db} "MATCH (n) RETURN count(n)"`,
      error:
        tenant === target
          ? null
          : `Neo.ClientError.Security.Forbidden: ACCESS on database '${db}' is not allowed for user '${user}' with roles [PUBLIC, team_${tenant}_reader].`,
      sample: true,
    });
  }
  if (tenant !== SAMPLE_TENANT) return err(404, "not_in_sample", `The offline sample only carries the Orbit team. Start the Helium API to open ${t.display_name}.`);

  const [a, b, c] = rest;
  if (method === "POST") {
    if (a === "chat") return ok(chat(String((body as { message?: string })?.message ?? ""), (body as { session_id?: string })?.session_id));
    if (a === "impact" && c === "draft") return prepareDraft(b, String((body as { current_fact_id?: string })?.current_fact_id ?? ""));
    return err(501, "sample_read_only", "This action writes to the team graph, so it needs the Helium API. The offline sample is read-only.");
  }

  switch (a) {
    case "facts": {
      if (b) {
        const f = facts.find((x) => x.id === b);
        return f ? ok(f) : err(404, "fact_not_found", "No such fact.");
      }
      const status = search.get("status") ?? "active";
      const kind = search.get("kind");
      const entity = search.get("entity");
      return ok(facts.filter((f) => (status === "all" || f.status === status) && (!kind || f.kind === kind) && (!entity || f.entities?.some((e) => e.id === entity))));
    }
    case "belief": {
      const at = Number(search.get("t") ?? Date.now());
      return ok(belief(at, search.get("entity")));
    }
    case "why": {
      if (why[b]) return ok(why[b]);
      const f = facts.find((x) => x.id === b);
      return f ? ok(synthesizeWhy(f)) : err(404, "node_not_found", "No such node in this team.");
    }
    case "timeline":
      return ok(timelineJson);
    case "meetings": {
      if (!b) return ok(meetings);
      const m = meetings.find((x) => x.id === b);
      if (!m) return err(404, "meeting_not_found", "No such meeting.");
      if (c === "episodes") return ok(episodes[b] ?? []);
      if (c === "audio") return err(404, "no_audio", "The sample carries no audio.");
      return ok(m);
    }
    case "threads": {
      if (!b) return ok(threads);
      const th = threads.find((x) => x.id === b);
      if (!th) return err(404, "thread_not_found", "No such thread.");
      return ok(c === "messages" ? (messages[b] ?? []) : th);
    }
    case "people":
      return ok(peopleJson);
    case "entities":
      return ok(entitiesJson);
    case "agents":
      return ok(agentsJson);
    case "tasks":
      return b ? err(404, "task_not_found", "The sample has no tasks.") : ok([]);
    case "skills":
      return ok(skillsJson);
    case "snapshots":
      return ok([]);
    case "impact": {
      if (b === "drafts") return ok([...drafts.values()]);
      return ok({ ...impact, items: impact.items.map((i) => ({ ...i, draft: drafts.get(i.id) ?? i.draft })) });
    }
    case "analytics":
      if (b === "contradictions") return ok(contradictionsJson);
      if (b === "stale-decisions") return ok(staleJson);
      return ok([]);
    case "search": {
      const q = search.get("q") ?? "";
      const k = Number(search.get("k") ?? 8);
      return ok({ q, items: search_(q, k), cypher: cypher.recall, retriever: "sample keyword match", indexes: [], ranker: "none", k });
    }
  }
  return err(404, "not_found", `No sample route for /${path}`);
}

function search_(q: string, k: number) {
  return search(q, k).map(({ f, score }) => ({ ...f, score }));
}
