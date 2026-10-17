const NAMES: Record<string, string> = {
  fact_agent: "Signal",
  followup_agent: "Relay",
  scheduler_agent: "Tempo",
  standup_agent: "Pulse",
  answer_agent: "Guide",
};

export function agentName(id: string, fallback = id): string {
  return NAMES[id] ?? fallback;
}
