/** Response shapes from the Helium HTTP API (docs/contracts/http-api.md). Only the fields the UI reads. */

export type Ref = { id: string; name: string };

export type Tenant = {
  slug: string;
  display_name: string;
  graph: string;
  nodes: number;
  edges: number;
  usage_mb?: number;
  counts: Partial<Record<"episodes" | "facts" | "decisions" | "commitments" | "tasks" | "skills" | "entities" | "meetings" | "threads", number>>;
  acl: { rw_user: string; ro_user: string; rules: string[]; isolation?: { note?: string; databases?: string[]; graphs?: string[] } };
};

export type AclProbe = { allowed: boolean; user: string; target_graph: string; command: string; error: string | null; result?: number; sample?: boolean };

export type FactKind = "fact" | "decision" | "commitment";
export type FactStatus = "active" | "superseded" | "retracted" | string;

export type FactSource = {
  kind: "utterance" | "email" | string;
  episode_id: string;
  container?: { id: string; title?: string; subject?: string; label?: string; source_uri?: string };
  t_start?: number;
  t_end?: number;
  sent_at?: number;
  message_id?: string;
};

export type Fact = {
  id: string;
  kind: FactKind;
  subject: string;
  predicate: string;
  object: string;
  text: string;
  confidence?: number;
  valid_from: number;
  valid_to: number | null;
  created_at?: number;
  status: FactStatus;
  speaker?: Ref | null;
  meeting?: { id: string; title: string } | null;
  thread?: { id: string; subject?: string; title?: string } | null;
  episode_id?: string;
  due_at?: number | null;
  entities?: { id: string; name: string; type?: string }[];
  source?: FactSource;
  supersedes_ids?: string[];
  key?: string;
};

export type TimelineEvent = {
  t: number;
  type: "meeting" | "email" | "fact.created" | "fact.superseded" | "decision" | "commitment" | string;
  id: string;
  text: string;
  kind?: FactKind;
  status?: FactStatus;
};

export type Timeline = { events: TimelineEvent[]; snapshots: { name: string; taken_at: number; label: string }[] };

export type Belief = { t: number; facts: Fact[]; cypher: string };

export type Why = {
  node: Fact & { labels?: string[] };
  speaker: (Ref & { role?: string; email?: string }) | null;
  meeting: { id: string; title: string; started_at?: number } | null;
  thread: { id: string; subject: string; started_at?: number } | null;
  episode: { id: string; text: string; t_start?: number; t_end?: number } | null;
  source: FactSource | null;
  entities?: { id: string; name: string }[];
  history: Fact[];
  supersedes: Fact[];
  superseded_by: Fact[];
  cypher: string;
  subgraph: { nodes: { id: string; label: string; labels?: string[]; props: Record<string, unknown> }[]; edges: { source: string; target: string; type: string }[] };
};

export type ChatEpisode = {
  episode_id: string;
  kind: string;
  speaker: string;
  container_id?: string;
  meeting?: string;
  thread?: string;
  t_start?: number;
  sent_at?: number;
  text: string;
  t?: number;
  score?: number;
};

export type ChatResponse = {
  answer: string;
  session_id: string;
  router: { intent: string; entities: string[]; route: string; template?: string };
  cypher: string[];
  sources: {
    fact_id: string;
    speaker: string;
    kind?: string;
    meeting?: string;
    thread?: string;
    t_start?: number;
    sent_at?: number;
    text?: string;
    valid_from?: number;
  }[];
  episodes: ChatEpisode[];
  model: string;
  latency_ms: number;
};

export type Meeting = { id: string; title: string; started_at: number; ended_at?: number; source_uri?: string; episodes: number; facts: number; status: string };
export type Thread = { id: string; subject: string; started_at?: number; messages?: number; facts?: number };
export type Episode = { id: string; seq: number; speaker: Ref; text: string; t_start: number; t_end: number; t_occurred: number };
export type Message = {
  id: string;
  seq: number;
  message_id: string;
  sender: Ref & { email?: string };
  to: (Ref & { email?: string })[];
  cc: (Ref & { email?: string })[];
  sent_at: number;
  text: string;
};

export type Agent = { id: string; name: string; model: string; capabilities: string[]; last_seen: number; state: "idle" | "working" | string };
export type Task = {
  id: string;
  kind: string;
  status: string;
  version: number;
  owner_agent: string | null;
  priority?: number;
  created_at: number;
  updated_at: number;
  payload?: Record<string, unknown>;
  about?: string[];
};
export type TaskTrace = { task: Task; events: { t: number; type: string; agent?: string; to_agent?: string; summary?: string; question?: string; reason?: string; artifact?: { kind?: string; title?: string; text?: string; body?: string } }[] };

export type ChatSession = { id: string; title: string; updated_at: number; turns: number };
export type ChatTurn = { role: string; text: string; t: number; response?: ChatResponse };

export type Skill = {
  id: string;
  goal: string;
  version: number;
  runs: number;
  success_rate: number;
  status: string;
  steps: { order: number; tool: string; args_template: string; guard: string }[];
  pagerank?: number | null;
};

export type ImpactItem = {
  id: string;
  title: string;
  status: string;
  rationale?: string;
  owner: Ref | null;
  assessment: "needs_review" | "aligned" | "closed" | "unresolved" | string;
  reason?: string;
  baseline?: Fact | null;
  current?: Fact | null;
  path?: unknown;
  draft?: { id?: string; text?: string; body?: string; created_at?: number; status?: string } | null;
  document?: { id?: string; title?: string; version?: string } | null;
};
export type Impact = { summary: Record<string, number>; items: ImpactItem[]; cypher: string };

export type Health = {
  ok: boolean;
  neo4j?: { version: string; databases?: string[]; kind?: string; events?: string };
  llm?: { backend: string; model: string };
  embeddings?: { model: string; dim: number };
  workers?: { tenant: string; agent: string; processed: number }[];
};

export type BenchRun = {
  run_id: string;
  ts: number;
  engine: string;
  target: string;
  agents: number;
  tenants: number;
  duration_s: number;
  read_p50: number;
  read_p95: number;
  read_p99: number;
  write_p50: number;
  write_p99: number;
  errors: number;
  cas: { attempts: number; winners: number; losers: number };
};

export type HeliumEvent = { event: string; payload: Record<string, unknown>; ts: number };
