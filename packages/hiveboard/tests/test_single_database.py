from hiveboard.db import HiveDB
from hiveboard import graphrag
from unittest.mock import Mock

import pytest


def test_single_database_override_routes_graph_and_read_handles_to_configured_database():
    db = HiveDB.__new__(HiveDB)
    db._database_override = "neo4j"
    db._driver = object()
    db._ro_drivers = {}
    db._ro_passwords = {}
    db._lock = __import__("threading").Lock()
    db.uri = "neo4j+s://example"

    assert db.graph("orbit").name == "neo4j"
    assert db.ro("orbit").name == "neo4j"


@pytest.mark.parametrize("database, expected", [("neo4j", "neo4j"), (None, "team-orbit")])
def test_search_targets_the_same_database_as_fact_writes(monkeypatch, database, expected):
    db = HiveDB.from_driver(object())
    db._database_override = database
    retriever = Mock()
    monkeypatch.setattr(graphrag, "HybridCypherRetriever", retriever)

    graphrag.fact_retriever(db, "orbit", lambda _: [0.0])

    assert retriever.call_args.kwargs["neo4j_database"] == expected
