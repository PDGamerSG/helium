// 30_recall_hybrid: vector KNN -> 1-hop graph expansion through shared entities -> retrieval policy inline.
// Params: $index ('fact_embedding'|'episode_embedding'|'skill_embedding'|'entity_embedding'), $q (768 floats), $n (candidates), $k (results), $now.
// db.index.vector.queryNodes returns a cosine SIMILARITY in [0, 1] ((1 + cos) / 2); distance = 2 * (1 - score) is the cosine
// distance (0 = identical) the policy was specified in. rank = recency * importance * similarity:
//   recency = exp(-age_days / 30) from valid_from (negative ages clamp to 0); importance = confidence clamped to [0.05, 1];
//   similarity = clamp(1 - distance, 0, 1). Nodes are returned as map projections without the embedding.
CALL db.index.vector.queryNodes($index, $n, $q) YIELD node AS f, score AS vscore
WITH f, 2.0 * (1.0 - vscore) AS distance
WHERE coalesce(f.status, 'active') = 'active'
OPTIONAL MATCH (f)-[:ABOUT|MENTIONS]->(e:Entity)<-[:ABOUT|MENTIONS]-(g)
WHERE g <> f AND coalesce(g.status, 'active') = 'active'
WITH f, distance,
     collect(DISTINCT e {.id, .name, .type, labels: labels(e)}) AS entities,
     collect(DISTINCT g {.id, .kind, .text, .object, .status, .valid_from, .t_occurred, .source_kind, .confidence, labels: labels(g)})[0..5] AS neighbours
WITH f, distance, entities, neighbours,
     toFloat($now - coalesce(f.valid_from, f.t_occurred, f.created_at, $now)) / 86400000.0 AS age_days,
     coalesce(f.confidence, 0.5) AS confidence
WITH f, distance, entities, neighbours,
     exp(-(CASE WHEN age_days < 0.0 THEN 0.0 ELSE age_days END) / 30.0) AS recency,
     CASE WHEN confidence < 0.05 THEN 0.05 WHEN confidence > 1.0 THEN 1.0 ELSE confidence END AS importance,
     CASE WHEN 1.0 - distance < 0.0 THEN 0.0 WHEN 1.0 - distance > 1.0 THEN 1.0 ELSE 1.0 - distance END AS similarity
RETURN f {.id, .kind, .subject, .predicate, .object, .key, .text, .confidence, .status, .valid_from, .valid_to, .created_at, .due_at,
          .seq, .t_start, .t_end, .t_occurred, .source_kind, .name, .type, .goal, .version, .runs, .success_rate,
          labels: labels(f), has_embedding: true} AS f,
       distance, entities, neighbours,
       recency * importance * similarity AS rank
ORDER BY rank DESC
LIMIT $k
