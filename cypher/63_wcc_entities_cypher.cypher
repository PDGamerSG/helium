// 63_wcc_entities_cypher: Cypher-only stand-in for 61_wcc_entities (no GDS): every entity reachable over CO_MENTIONED
// shares a component keyed by the smallest entity id in it. Fine at demo size; GDS for anything larger. No params.
MATCH (e:Entity)
OPTIONAL MATCH (e)-[:CO_MENTIONED*0..]-(f:Entity)
WITH e, collect(DISTINCT f.id) AS reach
WITH e, reduce(m = e.id, x IN reach | CASE WHEN x < m THEN x ELSE m END) AS component
WITH component, collect({id: e.id, name: e.name, type: e.type}) AS entities
RETURN component, entities
ORDER BY size(entities) DESC, component ASC
