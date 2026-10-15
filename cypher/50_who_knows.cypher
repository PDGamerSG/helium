// 50_who_knows: people who talked or wrote about an entity, ranked by episode mentions (SPOKEN_BY, SENT_BY, SENT_TO). Params: $name.
// Entity names are matched case-insensitively; the WITH barriers keep the plan readable in the Why panel.
MATCH (en:Entity) WHERE toLower(en.name) = toLower($name)
WITH en
MATCH (ep:Episode)-[:MENTIONS]->(en)
WITH DISTINCT ep
MATCH (ep)-[r:SPOKEN_BY|SENT_BY|SENT_TO]->(p:Person)
WITH p, count(DISTINCT ep) AS mentions, max(ep.t_occurred) AS last_at, collect(DISTINCT type(r)) AS via
RETURN p.id AS id, p.name AS name, mentions, last_at, via
ORDER BY mentions DESC, last_at DESC, id ASC
