"""Mirror one tenant database into another Neo4j (for example Aura Free, which has a single database).

    uv run --package hiveboard python scripts/mirror_tenant.py --tenant orbit \
        --to-env ~/Downloads/Neo4j-<id>-Created-<date>.txt [--wipe]

`--to-env` reads the credentials file Aura gives you when it creates the instance (NEO4J_URI, NEO4J_USERNAME,
NEO4J_PASSWORD, NEO4J_DATABASE), so the password stays out of shell history; `--to`, `--to-user`, `--to-password`
and `--to-database` override it. Without a database name the target user's home database is used: current Aura
instances name both the user and the database after the instance ID, not `neo4j`. The source connection comes from
`--from-*`, else the environment, else the repo's `.env`.

Copies every node and relationship (with labels, types and properties, embeddings included) and applies the schema
(indexes, constraints) on the target first, so vector and full-text queries work there. Tenancy, RBAC and CDC are not
part of the mirror; the target is one database.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "packages" / "hiveboard"))

from hiveboard.db import GraphDatabase, HiveDB
from hiveboard.schema import apply_schema


def read_credentials(path: str | Path) -> dict[str, str]:
    """KEY=VALUE lines of an Aura credentials file or a `.env` file; comments, blank lines and quotes are ignored."""
    values: dict[str, str] = {}
    for line in Path(path).expanduser().read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip().removeprefix("export ").strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        values[key] = value
    return values


def main() -> int:
    local = read_credentials(REPO / ".env") if (REPO / ".env").is_file() else {}

    def setting(name: str, default: str) -> str:
        return os.environ.get(name) or local.get(name) or default

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--tenant", required=True)
    parser.add_argument("--from-uri", default=setting("NEO4J_URI", "bolt://localhost:7687"))
    parser.add_argument("--from-user", default=setting("NEO4J_USER", "neo4j"))
    parser.add_argument("--from-password", default=setting("NEO4J_PASSWORD", ""))
    parser.add_argument("--to-env", help="Aura credentials file: NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, NEO4J_DATABASE")
    parser.add_argument("--to", help="target URI, e.g. neo4j+s://<id>.databases.neo4j.io")
    parser.add_argument("--to-user", help="target user (default: from --to-env, else neo4j)")
    parser.add_argument("--to-password", help="target password (prefer --to-env)")
    parser.add_argument("--to-database", help="target database (default: from --to-env, else the user's home database)")
    parser.add_argument("--wipe", action="store_true", help="delete everything in the target database first")
    parser.add_argument("--batch", type=int, default=500)
    args = parser.parse_args()
    creds = read_credentials(args.to_env) if args.to_env else {}
    to_uri = args.to or creds.get("NEO4J_URI")
    to_user = args.to_user or creds.get("NEO4J_USERNAME") or "neo4j"
    to_password = args.to_password or creds.get("NEO4J_PASSWORD")
    if not to_uri or not to_password:
        parser.error("give --to-env with an Aura credentials file, or --to and --to-password")

    source = HiveDB(args.from_uri, args.from_user, args.from_password)
    src = source.database(source.graph_name(args.tenant), read_only=True)
    target_driver = GraphDatabase.driver(to_uri, auth=(to_user, to_password), notifications_min_severity="OFF")
    to_database = args.to_database or creds.get("NEO4J_DATABASE")
    if not to_database:
        to_database = target_driver.execute_query("SHOW HOME DATABASE YIELD name", database_="system").records[0]["name"]
    target = HiveDB.from_driver(target_driver)
    dst = target.database(to_database)

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
    print(f"mirrored tenant {args.tenant}: {len(nodes)} nodes, {len(rels)} relationships into {to_uri} ({to_database})")
    target_driver.close()
    source.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
