// 21_handoff_task: hand a working task to another agent with a subgraph reference (ids of the nodes the receiver should read).
// Params: $id, $from (current owner), $to, $v (expected version), $now, $summary, $ids (subgraph node ids).
// The task returns to 'submitted' addressed to $to (owner_agent = $to) so only that agent picks it up. Zero rows = stale version / not owner.
// Same lock-then-check shape as 20_claim_task: the version check runs under the node's write lock.
MATCH (t:Task {id: $id})
SET t._lock = coalesce(t._lock, 0) + 1
WITH t
WHERE t.owner_agent = $from AND t.version = $v
MATCH (to:Agent {id: $to})
SET t.owner_agent = $to, t.status = 'submitted', t.version = $v + 1, t.updated_at = $now
CREATE (t)-[:HANDED_OFF {at: $now, from_agent: $from, summary: $summary, subgraph_ids: $ids}]->(to)
RETURN t.version AS version
