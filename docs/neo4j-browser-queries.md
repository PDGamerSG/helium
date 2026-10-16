# Neo4j Browser queries for the demo

Open http://localhost:7474 (user `neo4j`, the password from `.env`). Every tenant is its own database: start with
`:use team-orbit` (or `team-remote`). The graph view of the first query is the picture to keep on a second tab.

## The chain behind "When is the UPI flow due?"

```cypher
:use team-orbit
MATCH (f:Fact {key: 'upi flow|due'})
OPTIONAL MATCH (f)-[d:DERIVED_FROM]->(e:Episode)
OPTIONAL MATCH (e)-[b:SPOKEN_BY|SENT_BY]->(p:Person)
OPTIONAL MATCH (c)-[h:HAS_EPISODE]->(e)
OPTIONAL MATCH (f)-[s:SUPERSEDES]->(o:Fact)
RETURN f, d, e, b, p, h, c, s, o
```

Colour Fact nodes by `status` (active, superseded) and the chain reads left to right: 24 Sep, 25 Sep, 28 Sep.

## What was true on 10 September

```cypher
WITH 1789084799000 AS t
MATCH (f:Fact)
WHERE f.status <> 'retracted' AND f.valid_from <= t AND (f.valid_to IS NULL OR f.valid_to > t)
RETURN f.subject AS subject, f.predicate AS predicate, f.object AS object, f.valid_from, f.valid_to
ORDER BY f.valid_from DESC
```

## Tenancy, enforced by the server

```cypher
:use system
SHOW DATABASES YIELD name, currentStatus WHERE name STARTS WITH 'team-' RETURN name, currentStatus;
SHOW ROLE team_orbit_reader PRIVILEGES AS COMMANDS;
SHOW USER team_orbit_ro PRIVILEGES AS COMMANDS;
```

Then connect as `team_orbit_ro` (password `TENANT_RO_PASSWORD` from `.env`) and run `:use team-nimbus`: the server
answers that access to the database is not allowed.

## Change Data Capture, the agents' wake-up call

```cypher
:use team-orbit
CALL db.cdc.current() YIELD id RETURN id;
```

Keep the id, press "Move it to Friday" on the board, then:

```cypher
CALL db.cdc.query($id, [{select: 'n', labels: ['Fact']}, {select: 'r', type: 'SUPERSEDES'}, {select: 'n', labels: ['Task']}])
YIELD txId, seq, event
RETURN txId, seq, event.eventType AS kind, event.operation AS op, coalesce(event.type, event.labels) AS what,
       event.state.after.properties.status AS status
ORDER BY txId, seq
```

Each transaction is what `hiveboard/cdc.py` turned into one event: the new fact, the `SUPERSEDES` edge, the
`reschedule` task being claimed, handed off, claimed again and completed.

## Graph Data Science inside one query

```cypher
:use team-orbit
WITH 'demo-' + toString(timestamp()) AS g
CALL gds.graph.project(g, ['Task', 'Skill'], '*') YIELD graphName
CALL (graphName) {
  CALL gds.pageRank.stream(graphName) YIELD nodeId, score
  WITH gds.util.asNode(nodeId) AS n, score WHERE n:Skill
  RETURN collect({goal: n.goal, score: score}) AS rows
}
CALL gds.graph.drop(graphName) YIELD graphName AS dropped
UNWIND rows AS r RETURN r.goal, r.score ORDER BY r.score DESC
```

```cypher
MATCH (e:Entity)-[c:CO_MENTIONED]-(f:Entity) RETURN e, c, f LIMIT 150
```

## Vector and full-text indexes

```cypher
SHOW INDEXES YIELD name, type, labelsOrTypes, properties WHERE type IN ['VECTOR', 'FULLTEXT'] RETURN name, type, labelsOrTypes, properties;
CALL db.index.fulltext.queryNodes('episode_text', 'kinetic OR battery') YIELD node, score RETURN node.text, score LIMIT 5;
```

(The vector query needs a 768-d embedding as a parameter; the API's `GET /tenants/{t}/search?q=` and the Why panel
show the full hybrid query that `neo4j-graphrag` runs.)

## The real meetings

```cypher
:use team-remote
MATCH (f:Fact) WHERE f.subject IN ['battery', 'LCD display', 'buttons']
OPTIONAL MATCH (f)-[s:SUPERSEDES]->(o:Fact)
OPTIONAL MATCH (f)-[d:DERIVED_FROM]->(e:Episode)<-[h:HAS_EPISODE]-(m:Meeting)
RETURN f, s, o, d, e, h, m
```
