"""Aura support without a database: capability detection and the mirror script's credentials file.

Aura reports the `enterprise` edition and lists GDS and CDC procedures it cannot run, so `capabilities()` must not
take either signal at face value."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest
from hiveboard.db import HiveDB, QueryResult

ENTERPRISE_PROCEDURES = ["db.cdc.query", "gds.pageRank.stream", "gds.wcc.stream", "apoc.meta.stats"]


class StubSystem:
    def __init__(self, version: str, edition: str, procedures: list[str]):
        self.version, self.edition, self.procedures = version, edition, procedures

    def query(self, cypher: str, params=None, timeout=None) -> QueryResult:
        if "dbms.components" in cypher:
            return QueryResult([[self.version, self.edition]], ["version", "edition"])
        return QueryResult([[name] for name in self.procedures], ["name"])


class StubDriver:
    def __init__(self, gds_answers: bool):
        self.gds_answers = gds_answers

    def execute_query(self, query, *args, **kwargs):
        if not self.gds_answers:
            raise RuntimeError("Aura Graph Analytics is versionless.")
        return [], None, ["version"]


def probe(version: str, edition: str, procedures: list[str], gds_answers: bool) -> dict:
    db = HiveDB.from_driver(StubDriver(gds_answers))
    system = StubSystem(version, edition, procedures)
    db.system = lambda: system
    return db.capabilities()


def test_aura_free_is_single_database_without_gds_or_cdc():
    caps = probe("5.27-aura", "enterprise", ENTERPRISE_PROCEDURES, gds_answers=False)
    assert caps["aura"] is True
    assert caps["multi_database"] is False
    assert caps["cdc"] is False
    assert caps["gds"] is False
    assert caps["apoc"] is True


def test_aura_with_embedded_gds_keeps_gds():
    caps = probe("5.27-aura", "enterprise", ENTERPRISE_PROCEDURES, gds_answers=True)
    assert caps["gds"] is True
    assert caps["multi_database"] is False


def test_self_managed_enterprise_unchanged():
    caps = probe("2026.09.0", "enterprise", ENTERPRISE_PROCEDURES, gds_answers=True)
    assert caps["aura"] is False
    assert caps["multi_database"] is True
    assert caps["cdc"] is True
    assert caps["gds"] is True


def test_community_has_no_enterprise_features():
    caps = probe("2026.09.0", "community", ["apoc.meta.stats"], gds_answers=False)
    assert caps["multi_database"] is False
    assert caps["cdc"] is False
    assert caps["gds"] is False


@pytest.fixture(scope="module")
def mirror_script():
    path = Path(__file__).resolve().parents[3] / "scripts" / "mirror_tenant.py"
    spec = importlib.util.spec_from_file_location("mirror_tenant", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_read_aura_credentials_file(mirror_script, tmp_path):
    creds = tmp_path / "Neo4j-abc12345-Created-2026-10-17.txt"
    creds.write_text(
        "# Wait a few minutes before connecting using these details.\n"
        "NEO4J_URI=neo4j+s://abc12345.databases.neo4j.io\n"
        "NEO4J_USERNAME=abc12345\n"
        "NEO4J_PASSWORD=p=ss'word\n"
        "NEO4J_DATABASE=abc12345\n"
        "\n"
        "AURA_INSTANCENAME='Free instance'\n"
        "export EXTRA=\"quoted\"\n",
        encoding="utf-8",
    )
    values = mirror_script.read_credentials(creds)
    assert values["NEO4J_URI"] == "neo4j+s://abc12345.databases.neo4j.io"
    assert values["NEO4J_USERNAME"] == "abc12345"
    assert values["NEO4J_PASSWORD"] == "p=ss'word"
    assert values["NEO4J_DATABASE"] == "abc12345"
    assert values["AURA_INSTANCENAME"] == "Free instance"
    assert values["EXTRA"] == "quoted"
