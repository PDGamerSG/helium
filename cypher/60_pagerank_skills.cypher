// 60_pagerank_skills: GDS PageRank over the Task -[:USED]-> Skill graph; only Skill nodes are returned. No params.
// The in-memory projection is built, streamed and dropped inside this one query (a fresh name per call, so two
// concurrent callers never collide). The wildcard relationship projection is equivalent to USED here (the only type between
// Task and Skill nodes) and does not fail on a tenant where no skill has run yet. Needs the graph-data-science plugin; 62_pagerank_skills_cypher is the fallback.
WITH 'skills-' + toString(timestamp()) + '-' + toString(toInteger(rand() * 1000000)) AS g
CALL gds.graph.project(g, ['Task', 'Skill'], '*') YIELD graphName
CALL (graphName) {
  CALL gds.pageRank.stream(graphName) YIELD nodeId, score
  WITH gds.util.asNode(nodeId) AS node, score
  WHERE node:Skill
  RETURN collect({id: node.id, goal: node.goal, runs: node.runs, success_rate: node.success_rate, score: score}) AS rows
}
CALL gds.graph.drop(graphName) YIELD graphName AS dropped
UNWIND rows AS r
RETURN r.id AS id, r.goal AS goal, r.runs AS runs, r.success_rate AS success_rate, r.score AS score
ORDER BY score DESC
