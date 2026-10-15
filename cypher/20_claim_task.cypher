// 20_claim_task: compare-and-set claim. Zero rows = another agent won (or the task is no longer submitted at this version).
// Params: $id (task), $v (expected version), $agent, $now.
// Neo4j takes a node's write lock at its first SET, after MATCH already evaluated the predicate, so two claimants could
// both read version $v and both win. Bumping `_lock` takes the exclusive lock first; the WHERE below re-reads the node
// under that lock, so exactly one claimant sees status 'submitted' at version $v. (`_lock` is hidden from API records.)
MATCH (t:Task {id: $id})
SET t._lock = coalesce(t._lock, 0) + 1
WITH t
WHERE t.status = 'submitted' AND t.version = $v
MATCH (a:Agent {id: $agent})
SET t.status = 'working', t.version = $v + 1, t.owner_agent = $agent, t.updated_at = $now
CREATE (t)-[:CLAIMED_BY {at: $now}]->(a)
RETURN t.version AS version
