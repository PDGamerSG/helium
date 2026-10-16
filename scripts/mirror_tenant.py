"""Mirror one tenant database into another Neo4j (for example Aura Free, which has a single database).

    uv run --package hiveboard python scripts/mirror_tenant.py --tenant orbit \
        --to neo4j+s://<id>.databases.neo4j.io --to-user neo4j --to-password '...' [--to-database neo4j] [--wipe]

Copies every node and relationship (with labels, types and properties, embeddings included) and applies the schema
(indexes, constraints) on the target first, so vector and full-text queries work there. Tenancy, RBAC and CDC are not
part of the mirror; the target is one database.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "packages" / "hiveboard"))

from hiveboard.db import GraphDatabase, HiveDB
from hiveboard.schema import apply_schema


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--tenant", required=True)
    parser.add_argument("--from-uri", default=os.environ.get("NEO4J_URI", "bolt://localhost:7687"))
    parser.add_argument("--from-user", default=os.environ.get("NEO4J_USER", "neo4j"))
    parser.add_argument("--from-password", default=os.environ.get("NEO4J_PASSWORD", ""))
    parser.add_argument("--to", required=True, help="target URI, e.g. neo4j+s://<id>.databases.neo4j.io")
    parser.add_argument("--to-user", default="neo4j")
    parser.add_argument("--to-password", required=True)
    parser.add_argument("--to-database", default="neo4j", help="target database name (Aura Free: neo4j)")
    parser.add_argument("--wipe", action="store_true", help="delete everything in the target database first")
    parser.add_argument("--batch", type=int, default=500)
    args = parser.parse_args()

    source = HiveDB(args.from_uri, args.from_user, args.from_password)
    src = source.database(source.graph_name(args.tenant), read_only=True)
    target_driver = GraphDatabase.driver(args.to, auth=(args.to_user, args.to_password), notifications_min_severity="OFF")
    target = HiveDB.from_driver(target_driver)
    dst = target.database(args.to_database)

    if args.wipe:
        dst.query("MATCH (n) DETACH DELETE n")
    apply_schema(target, dst)
    dst.query("CREATE INDEX copy_src IF NOT EXISTS FOR (n:_Copy) ON (n._src)")
    dst.query("CALL db.awaitIndexes(60)")
    nodes = src.ro_query("MATCH (n) RETURN elementId(n) AS eid, labels(n) AS labels, properties(n) AS props").result_set
    for i in range(0, len(nodes), args.batch):
        rows = [{"eid": r[0], "labels": r[1], "props": r[2]} for r in nodes[i : i + args.batch]]
        dst.query("UNWIND $rows AS r CREATE (n:_Copy) SET n = r.props, n._src = r.eid SET n:$(r.labels)", {"rows": rows})
        print(f"nodes {min(i + args.batch, len(nodes))}/{len(nodes)}")
    rels = src.ro_query("MATCH (a)-[r]->(b) RETURN elementId(a) AS a, elementId(b) AS b, type(r) AS type, properties(r) AS props").result_set
    for i in range(0, len(rels), args.batch):
        rows = [{"a": r[0], "b": r[1], "type": r[2], "props": r[3]} for r in rels[i : i + args.batch]]
        dst.query(
            "UNWIND $rows AS r MATCH (a:_Copy {_src: r.a}) MATCH (b:_Copy {_src: r.b}) CREATE (a)-[rel:$(r.type)]->(b) SET rel = r.props",
            {"rows": rows},
        )
        print(f"relationships {min(i + args.batch, len(rels))}/{len(rels)}")
    dst.query("MATCH (n:_Copy) REMOVE n:_Copy, n._src")
    dst.query("DROP INDEX copy_src IF EXISTS")
    dst.query("CALL db.awaitIndexes(120)")
    print(f"mirrored tenant {args.tenant}: {len(nodes)} nodes, {len(rels)} relationships into {args.to} ({args.to_database})")
    target_driver.close()
    source.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
