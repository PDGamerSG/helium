"""Schema management: indexes from `cypher/00_schema.cypher` plus unique constraints, idempotent per database."""

from __future__ import annotations

import re

from .db import GraphHandle, HiveDB
from .queries import schema_statements

__all__ = ["FULLTEXT_INDEXES", "UNIQUE_ID_LABELS", "VECTOR_INDEXES", "apply_schema", "ensure_commons_schema", "ensure_schema"]

UNIQUE_ID_LABELS = [
    "Person",
    "Meeting",
    "EmailThread",
    "Episode",
    "Entity",
    "Fact",
    "Decision",
    "Commitment",
    "Task",
    "Agent",
    "Skill",
    "Step",
    "Artifact",
    "Snapshot",
    "WorkItem",
    "Document",
    "FollowUpDraft",
]
VECTOR_INDEXES = {"Episode": "episode_embedding", "Fact": "fact_embedding", "Skill": "skill_embedding", "Entity": "entity_embedding"}
FULLTEXT_INDEXES = {"Episode": "episode_text", "Fact": "fact_text", "Decision": "decision_text"}
_INDEX_NAME = re.compile(r"CREATE\s+(?:FULLTEXT\s+|VECTOR\s+|TEXT\s+|RANGE\s+|POINT\s+)?INDEX\s+(\w+)", re.IGNORECASE)


def constraint_name(label: str) -> str:
    return f"{label.lower()}_id"


def constraint_statements() -> list[str]:
    return [f"CREATE CONSTRAINT {constraint_name(label)} IF NOT EXISTS FOR (n:{label}) REQUIRE n.id IS UNIQUE" for label in UNIQUE_ID_LABELS]


def ensure_schema(db: HiveDB, tenant: str) -> dict[str, int]:
    """Create every index and unique constraint for the tenant database; safe to run repeatedly. Returns counts."""
    db.create_database(db.graph_name(tenant), cdc=True)
    return apply_schema(db, db.graph(tenant))


def ensure_commons_schema(db: HiveDB) -> dict[str, int]:
    """Same schema on the shared `commons` database (Tenant, Snapshot and published Skill nodes live there)."""
    from .db import COMMONS

    db.create_database(COMMONS)
    return apply_schema(db, db.commons())


def apply_schema(db: HiveDB, graph: GraphHandle) -> dict[str, int]:
    """Run the schema statements and constraints against one database handle."""
    existing_indexes = {row[0] for row in graph.query("SHOW INDEXES YIELD name RETURN name").result_set}
    existing_constraints = {row[0] for row in graph.query("SHOW CONSTRAINTS YIELD name RETURN name").result_set}
    counts = {"indexes_created": 0, "indexes_existing": 0, "constraints_created": 0, "constraints_existing": 0}
    statements = schema_statements()
    for statement in statements:
        match = _INDEX_NAME.search(statement)
        if match and match.group(1) in existing_indexes:
            counts["indexes_existing"] += 1
        else:
            counts["indexes_created"] += 1
    for label in UNIQUE_ID_LABELS:
        if constraint_name(label) in existing_constraints:
            counts["constraints_existing"] += 1
        else:
            counts["constraints_created"] += 1
    # One transaction for every schema command: a separate transaction per index costs 100 to 200 ms each.
    graph.run_many([*statements, *constraint_statements()])
    graph.query("CALL db.awaitIndexes(120)")
    return counts
