"""Connection handling: one Neo4j database per tenant (`team-<slug>`), a shared `commons` database,
and per-tenant read-only drivers that authenticate as the tenant's `team_<slug>_ro` user.

Neo4j database names allow letters, digits, dots and dashes only (no underscores), so a tenant slug
`orbit_app` lives in the database `team-orbit-app`; `tenant_of()` reverses the mapping. Everything
else keeps the result shape the rest of the package was written against: a graph handle with
`query()` (write transaction) and `ro_query()` (read transaction, writes refused by the server, per-call
timeout) returning `.result_set` rows and `.header` column names.
"""

from __future__ import annotations

import logging
import os
import threading
from collections import defaultdict, deque
from collections.abc import Callable
from typing import Any

from neo4j import READ_ACCESS, WRITE_ACCESS, Driver, GraphDatabase, unit_of_work
from neo4j.exceptions import ClientError, Neo4jError, ServiceUnavailable

log = logging.getLogger("hiveboard.db")

DEFAULT_URI = "bolt://localhost:7687"
COMMONS = "commons"
SYSTEM = "system"
TENANT_PREFIX = "team-"
SNAPSHOT_MARK = "-snap-"
QueryError = Neo4jError
EventListener = Callable[[dict[str, Any]], None]


class QueryResult:
    """Query result: `.result_set` rows as lists, `.header` column names, `.summary`."""

    __slots__ = ("header", "result_set", "summary")

    def __init__(self, rows: list[list[Any]], header: list[str], summary: Any = None):
        self.result_set = rows
        self.header = header
        self.summary = summary

    def __iter__(self):
        return iter(self.result_set)

    def __len__(self) -> int:
        return len(self.result_set)


class GraphHandle:
    """One database seen through one driver. `query` runs a managed write transaction, `ro_query` a managed
    read transaction (the server refuses writes inside it) with a transaction timeout in milliseconds."""

    def __init__(self, db: HiveDB, driver: Driver, name: str, read_only: bool = False):
        self.db = db
        self.driver = driver
        self.name = name
        self.read_only = read_only

    def _run(self, cypher: str, params: dict | None, timeout_ms: int | None, access: str) -> QueryResult:
        def work(tx):
            res = tx.run(cypher, params or {})
            header = list(res.keys())
            rows = [list(record.values()) for record in res]
            return QueryResult(rows, header, res.consume())

        if timeout_ms:
            work = unit_of_work(timeout=timeout_ms / 1000.0)(work)
        with self.driver.session(database=self.name, default_access_mode=access) as session:
            if access == READ_ACCESS:
                return session.execute_read(work)
            return session.execute_write(work)

    def query(self, cypher: str, params: dict | None = None, timeout: int | None = None) -> QueryResult:
        """Write transaction (or a read transaction when this handle is read-only)."""
        if self.read_only:
            return self.ro_query(cypher, params, timeout)
        return self._run(cypher, params, timeout, WRITE_ACCESS)

    def ro_query(self, cypher: str, params: dict | None = None, timeout: int | None = None) -> QueryResult:
        """Read transaction with an optional timeout (ms). A write clause raises `neo4j.exceptions.ClientError`."""
        return self._run(cypher, params, timeout, READ_ACCESS)

    def run_many(self, statements: list[str]) -> None:
        """Run several statements inside one write transaction (schema commands batch well this way)."""

        def work(tx):
            for statement in statements:
                tx.run(statement).consume()

        with self.driver.session(database=self.name, default_access_mode=WRITE_ACCESS) as session:
            session.execute_write(work)

    def delete(self) -> None:
        """Drop this database (admin driver, `system` database)."""
        self.db.drop_database(self.name)


class HiveDB:
    """Admin driver plus graph handles. Thread-safe: the neo4j driver keeps a connection pool."""

    def __init__(
        self,
        uri: str | None = None,
        user: str | None = None,
        password: str | None = None,
        *,
        admin_user: str | None = None,
        admin_password: str | None = None,
        max_pool: int = 100,
    ):
        self.uri = uri or os.environ.get("NEO4J_URI") or DEFAULT_URI
        self.user = user or admin_user or os.environ.get("NEO4J_USER") or "neo4j"
        self.password = password or admin_password or os.environ.get("NEO4J_PASSWORD") or ""
        self.admin_user = self.user
        self.admin_password = self.password
        self._driver = GraphDatabase.driver(
            self.uri, auth=(self.user, self.password), max_connection_pool_size=max_pool, notifications_min_severity="OFF"
        )
        self._ro_drivers: dict[str, Driver] = {}
        self._ro_passwords: dict[str, str] = {}
        self._lock = threading.Lock()
        self._capabilities: dict[str, Any] | None = None
        # True while a hiveboard.cdc tailer delivers this database's events; publish() then only records.
        self.cdc_active = False
        # In-process event bus (see hiveboard.events): listeners and a replay buffer per tenant.
        self._listeners: dict[str, list[EventListener]] = defaultdict(list)
        self._history: dict[str, deque] = defaultdict(lambda: deque(maxlen=500))

    @classmethod
    def from_driver(cls, driver: Driver) -> HiveDB:
        """Wrap an existing driver (another server, e.g. an Aura mirror target); no tenancy helpers are needed."""
        db = cls.__new__(cls)
        db.uri, db.user, db.password = str(getattr(driver, "_uri", "")), "", ""
        db.admin_user, db.admin_password = "", ""
        db._driver = driver
        db._ro_drivers, db._ro_passwords = {}, {}
        db._lock = threading.Lock()
        db._capabilities = None
        db.cdc_active = False
        db._listeners = defaultdict(list)
        db._history = defaultdict(lambda: deque(maxlen=500))
        return db

    # -- naming -------------------------------------------------------------------------------
    @staticmethod
    def graph_name(tenant: str) -> str:
        """`team-<slug>` with underscores folded to dashes (Neo4j database names allow no underscore)."""
        return f"{TENANT_PREFIX}{tenant.replace('_', '-')}"

    @staticmethod
    def tenant_of(database: str) -> str | None:
        """Inverse of `graph_name`; None for `commons`, `system`, snapshots and foreign databases."""
        if not database.startswith(TENANT_PREFIX) or SNAPSHOT_MARK in database:
            return None
        return database[len(TENANT_PREFIX) :].replace("-", "_")

    @staticmethod
    def rw_user(tenant: str) -> str:
        return f"team_{tenant}_rw"

    @staticmethod
    def ro_user(tenant: str) -> str:
        return f"team_{tenant}_ro"

    @staticmethod
    def writer_role(tenant: str) -> str:
        return f"team_{tenant}_writer"

    @staticmethod
    def reader_role(tenant: str) -> str:
        return f"team_{tenant}_reader"

    # -- handles ------------------------------------------------------------------------------
    @property
    def driver(self) -> Driver:
        """The admin neo4j driver (database management, schema, writes)."""
        return self._driver

    @property
    def client(self) -> Driver:
        """Alias kept for callers written against the previous substrate."""
        return self._driver

    def database(self, name: str, read_only: bool = False) -> GraphHandle:
        """Handle on any database by name (admin driver)."""
        return GraphHandle(self, self._driver, name, read_only=read_only)

    def system(self) -> GraphHandle:
        """The `system` database: CREATE/DROP DATABASE, users, roles, grants."""
        return GraphHandle(self, self._driver, SYSTEM)

    def graph(self, tenant: str) -> GraphHandle:
        """Read-write handle for a tenant (admin credentials)."""
        return GraphHandle(self, self._driver, self.graph_name(tenant))

    def ro(self, tenant: str) -> GraphHandle:
        """Read-only handle: the tenant's `team_<slug>_ro` user when its password is configured, otherwise the
        admin driver in read access mode. Either way the transaction is read-only and writes are refused."""
        with self._lock:
            driver = self._ro_drivers.get(tenant)
            if driver is None and tenant in self._ro_passwords:
                driver = GraphDatabase.driver(
                    self.uri,
                    auth=(self.ro_user(tenant), self._ro_passwords[tenant]),
                    max_connection_pool_size=20,
                    notifications_min_severity="OFF",
                )
                self._ro_drivers[tenant] = driver
        return GraphHandle(self, driver or self._driver, self.graph_name(tenant), read_only=True)

    def configure_ro(self, tenant: str, password: str | None) -> None:
        """Register (or forget, with None) the ro user's password so `ro()` connects as that user."""
        with self._lock:
            old = self._ro_drivers.pop(tenant, None)
            if password is None:
                self._ro_passwords.pop(tenant, None)
            else:
                self._ro_passwords[tenant] = password
        if old is not None:
            old.close()

    def user_driver(self, user: str, password: str) -> Driver:
        """A throwaway driver for another user (ACL probes); the caller closes it."""
        return GraphDatabase.driver(self.uri, auth=(user, password), max_connection_pool_size=2, notifications_min_severity="OFF")

    def commons(self) -> GraphHandle:
        """The shared `commons` database (tenant registry, snapshot metadata, published skills)."""
        return GraphHandle(self, self._driver, COMMONS)

    # -- databases ----------------------------------------------------------------------------
    def list_databases(self) -> list[str]:
        rows = self.system().query("SHOW DATABASES YIELD name, type WHERE type = 'standard' RETURN DISTINCT name").result_set
        return sorted(r[0] for r in rows)

    def list_graphs(self) -> list[str]:
        """Alias of `list_databases` minus `system` and `neo4j` (kept for the previous substrate's callers)."""
        return [n for n in self.list_databases() if n not in (SYSTEM, "neo4j")]

    def graph_exists(self, name: str) -> bool:
        return name in self.list_databases()

    def list_tenants(self) -> list[str]:
        """Tenant slugs derived from `team-*` databases (snapshot copies excluded)."""
        return sorted(t for t in (self.tenant_of(n) for n in self.list_databases()) if t)

    def create_database(self, name: str, *, cdc: bool = False) -> bool:
        """`CREATE DATABASE name IF NOT EXISTS ... WAIT`; returns True when it was created now. On Enterprise the
        transaction log is enriched (`txLogEnrichment: FULL`) so Change Data Capture can replay every write."""
        if self.graph_exists(name):
            return False
        options = " OPTIONS {txLogEnrichment: 'FULL'}" if cdc and self.capabilities()["cdc"] else ""
        self.system().query(f"CREATE DATABASE `{name}` IF NOT EXISTS{options} WAIT")
        return True

    def drop_database(self, name: str) -> None:
        self.system().query(f"DROP DATABASE `{name}` IF EXISTS DESTROY DATA WAIT")

    # -- introspection ------------------------------------------------------------------------
    def usage(self, tenant: str) -> dict[str, Any]:
        """Node and relationship counts by label and type (`apoc.meta.stats` when APOC is installed). Neo4j does
        not expose per-database memory the way the previous substrate did, so `total_mb` is 0 and the UI shows counts."""
        graph = self.graph(tenant)
        raw: dict[str, Any]
        try:
            row = graph.ro_query(
                "CALL apoc.meta.stats() YIELD nodeCount, relCount, labels, relTypesCount RETURN nodeCount, relCount, labels, relTypesCount",
                timeout=3000,
            ).result_set[0]
            raw = {"nodes": row[0], "edges": row[1], "labels": dict(row[2] or {}), "rel_types": dict(row[3] or {})}
        except Exception:  # noqa: BLE001 - APOC absent: plain counts
            nodes = graph.ro_query("MATCH (n) RETURN count(n)", timeout=3000).result_set[0][0]
            edges = graph.ro_query("MATCH ()-[r]->() RETURN count(r)", timeout=3000).result_set[0][0]
            raw = {"nodes": nodes, "edges": edges, "labels": {}, "rel_types": {}}
        return {
            "total_mb": 0.0,
            "indices_mb": 0.0,
            "nodes_by_label_mb": {},
            "edges_by_type_mb": {},
            "nodes": int(raw["nodes"]),
            "edges": int(raw["edges"]),
            "raw": raw,
        }

    def ping(self) -> bool:
        try:
            self._driver.verify_connectivity()
            return True
        except (ServiceUnavailable, Neo4jError, OSError):
            return False

    def server_version(self) -> str:
        """Neo4j kernel version, e.g. `2026.09.0`."""
        return str(self.capabilities().get("version") or "unknown")

    def capabilities(self) -> dict[str, Any]:
        """Probed once: edition, version, and whether GDS, APOC, CDC and multiple databases are available."""
        if self._capabilities is None:
            caps: dict[str, Any] = {"edition": None, "version": None, "gds": False, "apoc": False, "cdc": False, "multi_database": False, "vector": True}
            try:
                row = self.system().query(
                    "CALL dbms.components() YIELD name, versions, edition WHERE name = 'Neo4j Kernel' RETURN versions[0], edition"
                ).result_set[0]
                caps["version"], caps["edition"] = row[0], row[1]
                caps["multi_database"] = str(row[1]).lower() == "enterprise"
            except Exception as exc:  # noqa: BLE001
                log.warning("dbms.components failed: %s", exc)
            try:
                names = {r[0] for r in self.system().query("SHOW PROCEDURES YIELD name RETURN name").result_set}
                caps["gds"] = "gds.pageRank.stream" in names and "gds.wcc.stream" in names
                caps["apoc"] = "apoc.meta.stats" in names
                caps["cdc"] = "db.cdc.query" in names and caps["multi_database"]
            except Exception as exc:  # noqa: BLE001
                log.warning("SHOW PROCEDURES failed: %s", exc)
            self._capabilities = caps
        return self._capabilities

    # -- events (in-process bus; hiveboard.events is the public API) --------------------------
    def add_listener(self, tenant: str, fn: EventListener) -> None:
        with self._lock:
            self._listeners[tenant].append(fn)

    def remove_listener(self, tenant: str, fn: EventListener) -> None:
        with self._lock:
            if fn in self._listeners.get(tenant, []):
                self._listeners[tenant].remove(fn)

    def dispatch(self, tenant: str, message: dict[str, Any]) -> None:
        with self._lock:
            self._history[tenant].append(message)
            listeners = list(self._listeners.get(tenant, []))
        for fn in listeners:
            try:
                fn(message)
            except Exception as exc:  # noqa: BLE001 - one bad listener must not break the publisher
                log.warning("event listener failed: %s", exc)

    def record_only(self, tenant: str, message: dict[str, Any]) -> None:
        """Keep a message for replay without delivering it (CDC mode: the change log delivers)."""
        with self._lock:
            self._history[tenant].append(message)

    def recent_events(self, tenant: str, n: int = 50) -> list[dict[str, Any]]:
        with self._lock:
            return list(self._history[tenant])[-n:]

    def close(self) -> None:
        with self._lock:
            drivers = list(self._ro_drivers.values())
            self._ro_drivers.clear()
        for driver in drivers:
            driver.close()
        self._driver.close()


__all__ = [
    "COMMONS",
    "SNAPSHOT_MARK",
    "SYSTEM",
    "TENANT_PREFIX",
    "ClientError",
    "GraphHandle",
    "HiveDB",
    "Neo4jError",
    "QueryError",
    "QueryResult",
]
