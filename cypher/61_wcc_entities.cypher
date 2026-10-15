// 61_wcc_entities: GDS weakly connected components over Entity nodes joined by CO_MENTIONED edges (written by 05_link_mentions). No params.
// Projection built, streamed and dropped in one query; the wildcard type is CO_MENTIONED in practice (the only type between
// Entity nodes) and tolerates a tenant without one yet. 63_wcc_entities_cypher is the fallback without the GDS plugin.
WITH 'entities-' + toString(timestamp()) + '-' + toString(toInteger(rand() * 1000000)) AS g
CALL gds.graph.project(g, 'Entity', {ALL: {type: '*', orientation: 'UNDIRECTED'}}) YIELD graphName
CALL (graphName) {
  CALL gds.wcc.stream(graphName) YIELD nodeId, componentId
  WITH gds.util.asNode(nodeId) AS node, componentId
  RETURN collect({component: componentId, id: node.id, name: node.name, type: node.type}) AS rows
}
CALL gds.graph.drop(graphName) YIELD graphName AS dropped
UNWIND rows AS r
WITH r.component AS component, collect({id: r.id, name: r.name, type: r.type}) AS entities
RETURN component, entities
ORDER BY size(entities) DESC, component ASC
