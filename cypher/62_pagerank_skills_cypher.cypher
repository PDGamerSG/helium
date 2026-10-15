// 62_pagerank_skills_cypher: Cypher-only stand-in for 60_pagerank_skills when the GDS plugin is absent (Aura Free, Community):
// score = 0.15 + 0.85 * (uses of this skill / uses of every skill), the one-step PageRank of a star graph. No params.
MATCH (s:Skill)
OPTIONAL MATCH (:Task)-[u:USED]->(s)
WITH s, count(u) AS uses
WITH collect({s: s, uses: uses}) AS rows, sum(uses) AS total
UNWIND rows AS r
RETURN r.s.id AS id, r.s.goal AS goal, r.s.runs AS runs, r.s.success_rate AS success_rate,
       0.15 + 0.85 * (toFloat(r.uses) / CASE WHEN total = 0 THEN 1 ELSE total END) AS score
ORDER BY score DESC
