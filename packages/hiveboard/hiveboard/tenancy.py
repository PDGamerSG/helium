"""Tenants: one database `team-<slug>` plus two users (`team_<slug>_rw`, `team_<slug>_ro`) bound to two roles,
snapshots as database copies, and a registry row in `commons`.

Access control is Neo4j RBAC, enforced by the server per database:

- reader role `team_<slug>_reader`: ACCESS on the tenant database and `commons`, MATCH {*} (traverse + read)
- writer role `team_<slug>_writer`: the above plus WRITE and NAME MANAGEMENT (new labels, types, property names)

Neither role is granted anything on another tenant's database, so a query against it fails with
"Database access is not allowed for user ...". Schema (indexes, constraints) stays with the admin user.
"""

from __future__ import annotations

import re
from typing import Any

from .db import COMMONS, SNAPSHOT_MARK, ClientError, HiveDB, Neo4jError
from .errors import NotFound
from .ids import new_id
from .queries import load_cypher
from .schema import apply_schema, ensure_commons_schema, ensure_schema
from .temporal import now_ms

READER_PRIVILEGES = (
    "GRANT ACCESS ON DATABASE `{db}` TO {role}",
    "GRANT MATCH {{*}} ON GRAPH `{db}` TO {role}",
)
WRITER_PRIVILEGES = READER_PRIVILEGES + (
    "GRANT WRITE ON GRAPH `{db}` TO {role}",
    "GRANT NAME MANAGEMENT ON DATABASE `{db}` TO {role}",
)
_SLUG = re.compile(r"^[a-z0-9][a-z0-9_]{0,57}$")


def validate_slug(tenant: str) -> str:
    """Slugs are `[a-z0-9_]`, start alphanumeric, at most 58 chars (`team-<slug>` must fit Neo4j's 63-char limit)."""
    if not _SLUG.match(tenant):
        raise ValueError(f"invalid tenant slug {tenant!r}: use [a-z0-9_], 1-58 chars")
    return tenant


def _existing_users(db: HiveDB) -> set[str]:
    return {row[0] for row in db.system().query("SHOW USERS YIELD user RETURN user").result_set}


def _bind_user(
    db: HiveDB, user: str, password: str, role: str, privileges: tuple[str, ...], databases: list[str], *, reset_password: bool
) -> None:
    """Create (or keep) a user, its role and the role's grants on the given databases.

    The user's home database is the tenant database (first of `databases`): the built-in PUBLIC role grants
    ACCESS ON HOME DATABASE, which would otherwise let every user open the DBMS default database `neo4j`."""
    system = db.system()
    home = databases[0]
    if user not in _existing_users(db):
        system.query(
            f"CREATE USER {user} IF NOT EXISTS SET PASSWORD $pw CHANGE NOT REQUIRED SET HOME DATABASE `{home}`", {"pw": password}
        )
    elif reset_password:
        try:
            system.query(f"ALTER USER {user} SET PASSWORD $pw CHANGE NOT REQUIRED", {"pw": password})
        except ClientError as exc:
            if "cannot be the same" not in str(exc):  # already the requested password
                raise
        system.query(f"ALTER USER {user} SET STATUS ACTIVE SET HOME DATABASE `{home}`")
    system.query(f"CREATE ROLE {role} IF NOT EXISTS")
    system.query(f"GRANT ROLE {role} TO {user}")
    for database in databases:
        for template in privileges:
            system.query(template.format(db=database, role=role))


def ensure_tenant_access(db: HiveDB, tenant: str, password_rw: str, password_ro: str) -> None:
    """Restore missing users, roles or grants after a reset; never rotate or re-enable an existing user."""
    validate_slug(tenant)
    graph = db.graph_name(tenant)
    if not db.graph_exists(graph):
        raise NotFound(f"tenant {tenant!r} does not exist")
    databases = [graph, COMMONS]
    _bind_user(db, db.rw_user(tenant), password_rw, db.writer_role(tenant), WRITER_PRIVILEGES, databases, reset_password=False)
    _bind_user(db, db.ro_user(tenant), password_ro, db.reader_role(tenant), READER_PRIVILEGES, databases, reset_password=False)
    db.configure_ro(tenant, password_ro)


def create_tenant(
    db: HiveDB, tenant: str, display_name: str, password_rw: str, password_ro: str
) -> dict[str, Any]:
    """Create database + schema + users/roles/grants + registry row in `commons`. Idempotent; re-running resets passwords."""
    validate_slug(tenant)
    graph = db.graph_name(tenant)
    schema = ensure_schema(db, tenant)
    ensure_commons_schema(db)
    databases = [graph, COMMONS]
    _bind_user(db, db.rw_user(tenant), password_rw, db.writer_role(tenant), WRITER_PRIVILEGES, databases, reset_password=True)
    _bind_user(db, db.ro_user(tenant), password_ro, db.reader_role(tenant), READER_PRIVILEGES, databases, reset_password=True)
    db.configure_ro(tenant, password_ro)
    db.commons().query(
        load_cypher("upsert_tenant"),
        {
            "slug": tenant,
            "display_name": display_name,
            "graph": graph,
            "rw_user": db.rw_user(tenant),
            "ro_user": db.ro_user(tenant),
            "now": now_ms(),
        },
    )
    info = acl_rules(db, tenant)
    info.update({"slug": tenant, "display_name": display_name, "schema": schema})
    return info


def delete_tenant(db: HiveDB, tenant: str) -> None:
    """Drop the tenant database and its snapshots, both users and roles, and the registry rows."""
    validate_slug(tenant)
    graph = db.graph_name(tenant)
    for name in db.list_databases():
        if name == graph or name.startswith(graph + SNAPSHOT_MARK):
            db.drop_database(name)
    system = db.system()
    for user in (db.rw_user(tenant), db.ro_user(tenant)):
        system.query(f"DROP USER {user} IF EXISTS")
    for role in (db.writer_role(tenant), db.reader_role(tenant)):
        system.query(f"DROP ROLE {role} IF EXISTS")
    db.configure_ro(tenant, None)
    if db.graph_exists(COMMONS):
        db.commons().query(load_cypher("delete_tenant_meta"), {"slug": tenant})


def acl_rules(db: HiveDB, tenant: str) -> dict[str, Any]:
    """The grants in force for the tenant's two users, as Cypher administration commands, for the UI."""
    graph = db.graph_name(tenant)
    rules: list[str] = []
    for user, role in ((db.rw_user(tenant), db.writer_role(tenant)), (db.ro_user(tenant), db.reader_role(tenant))):
        rules.append(f"GRANT ROLE {role} TO {user}")
        try:
            rows = db.system().query(f"SHOW ROLE {role} PRIVILEGES AS COMMANDS YIELD command RETURN command").result_set
        except Neo4jError:
            rows = []
        rules.extend(str(r[0]) for r in rows)
    return {
        "graph": graph,
        "rw_user": db.rw_user(tenant),
        "ro_user": db.ro_user(tenant),
        "rules": rules,
        "isolation": {
            "graphs": [graph, COMMONS],
            "databases": [graph, COMMONS],
            "ro_user_can_write": False,
            "ro_user_can_read_other_tenants": False,
            "rw_user_can_write_commons": True,
            "note": "Neo4j RBAC: the reader role holds ACCESS and MATCH {*} on this tenant's database and commons only; "
            "the writer role adds WRITE and NAME MANAGEMENT. Another tenant's database is not accessible at all.",
        },
    }


def list_registered_tenants(db: HiveDB) -> list[dict[str, Any]]:
    """Registry rows from `commons` (slug, display_name, graph, users)."""
    if not db.graph_exists(COMMONS):
        return []
    res = db.commons().ro_query(load_cypher("list_tenants"), timeout=3000)
    keys = ["slug", "display_name", "graph", "rw_user", "ro_user", "created_at"]
    return [dict(zip(keys, row)) for row in res.result_set]


def copy_database(db: HiveDB, source: str, target: str, batch: int = 500) -> dict[str, int]:
    """Copy every node and relationship of `source` into a new database `target` (schema applied first).
    Nodes carry a temporary `_Copy` label and `_src` property during the copy so relationships can be re-attached
    through an index; both are removed at the end."""
    db.create_database(target)
    src = db.database(source, read_only=True)
    dst = db.database(target)
    apply_schema(db, dst)
    dst.query("CREATE INDEX copy_src IF NOT EXISTS FOR (n:_Copy) ON (n._src)")
    dst.query("CALL db.awaitIndexes(60)")
    nodes = src.ro_query("MATCH (n) RETURN elementId(n) AS eid, labels(n) AS labels, properties(n) AS props").result_set
    for i in range(0, len(nodes), batch):
        rows = [{"eid": r[0], "labels": r[1], "props": r[2]} for r in nodes[i : i + batch]]
        dst.query(
            "UNWIND $rows AS r CREATE (n:_Copy) SET n = r.props, n._src = r.eid SET n:$(r.labels)",
            {"rows": rows},
        )
    rels = src.ro_query(
        "MATCH (a)-[r]->(b) RETURN elementId(a) AS a, elementId(b) AS b, type(r) AS type, properties(r) AS props"
    ).result_set
    for i in range(0, len(rels), batch):
        rows = [{"a": r[0], "b": r[1], "type": r[2], "props": r[3]} for r in rels[i : i + batch]]
        dst.query(
            "UNWIND $rows AS r MATCH (a:_Copy {_src: r.a}) MATCH (b:_Copy {_src: r.b}) "
            "CREATE (a)-[rel:$(r.type)]->(b) SET rel = r.props",
            {"rows": rows},
        )
    dst.query("MATCH (n:_Copy) REMOVE n:_Copy, n._src")
    dst.query("DROP INDEX copy_src IF EXISTS")
    return {"nodes": len(nodes), "edges": len(rels)}


def snapshot(db: HiveDB, tenant: str, label: str) -> str:
    """Copy `team-<slug>` into `team-<slug>-snap-<ms>` and record a Snapshot node in `commons`; returns the copy's name."""
    graph = db.graph_name(tenant)
    if not db.graph_exists(graph):
        raise NotFound(f"database {graph} does not exist")
    taken_at = now_ms()
    name = f"{graph}{SNAPSHOT_MARK}{taken_at}"
    copy_database(db, graph, name)
    ensure_commons_schema(db)
    db.commons().query(
        load_cypher("record_snapshot"),
        {"id": new_id("snap"), "tenant": tenant, "graph_name": name, "label": label, "now": taken_at},
    )
    return name


def list_snapshots(db: HiveDB, tenant: str) -> list[dict[str, Any]]:
    """Snapshots of a tenant, newest first: `[{id, name, label, taken_at, exists}]`."""
    if not db.graph_exists(COMMONS):
        return []
    res = db.commons().ro_query(load_cypher("list_snapshots"), {"tenant": tenant}, timeout=3000)
    databases = set(db.list_databases())
    return [
        {"id": row[0], "name": row[1], "label": row[2], "taken_at": row[3], "exists": row[1] in databases}
        for row in res.result_set
    ]
