// 40_skill_retrieve: best ACTIVE skills for a goal: vector KNN over Skill.embedding, ordered by success_rate then distance, with steps.
// Params: $goal (768 floats), $n (candidates), $k (results). distance = 2 * (1 - similarity), see 30_recall_hybrid.
CALL db.index.vector.queryNodes('skill_embedding', $n, $goal) YIELD node AS s, score AS vscore
WITH s, 2.0 * (1.0 - vscore) AS distance
WHERE s.status = 'active'
OPTIONAL MATCH (s)-[st:STEP]->(step:Step)
WITH s, distance, collect({order: st.order, id: step.id, tool: step.tool, args_template: step.args_template, guard: step.guard}) AS steps
RETURN s {.id, .goal, .version, .runs, .success_rate, .status, .created_at, .last_run_at, labels: labels(s), has_embedding: true} AS s,
       distance, steps
ORDER BY s.success_rate DESC, distance ASC
LIMIT $k
