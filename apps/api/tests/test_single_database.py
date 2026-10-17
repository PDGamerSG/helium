"""Aura Free starts one workspace and never requires a commons database."""

from unittest.mock import Mock

from fastapi.testclient import TestClient
from hiveboard.db import HiveDB

from apps.api.hive_adapter import RealHive, build_hive
from apps.api.main import create_app


def single_hive():
    db = HiveDB.from_driver(object())
    return RealHive(db, rw_password="unused", ro_password="unused", events_mode="cdc", single_database="neo4j")


def test_aura_startup_prepares_only_one_of_the_default_seed_tenants(ctx_factory, monkeypatch):
    ctx = ctx_factory(seed_tenants="orbit,nimbus,quill")
    ctx.hive = single_hive()
    prepared = []
    registered = []
    monkeypatch.setattr(ctx.hive, "ensure_schema", lambda tenant: prepared.append(tenant))
    monkeypatch.setattr(ctx.hive, "register_agent", lambda tenant, *args: registered.append(tenant))

    with TestClient(create_app(ctx, start_workers=False)):
        assert ctx.startup_error is None
        assert prepared == ["orbit"]
        assert set(registered) == {"orbit"}
        assert ctx.hive.events_mode == "memory"


def test_aura_timeline_does_not_query_enterprise_snapshot_registry():
    hive = single_hive()
    assert hive.list_snapshots("orbit") == []


def test_aura_mode_defaults_to_the_existing_neo4j_database(ctx_factory, monkeypatch):
    ctx = ctx_factory(neo4j_single_database=True, neo4j_database=None)
    monkeypatch.delenv("HIVE_BACKEND", raising=False)
    connect = Mock()
    monkeypatch.setattr(RealHive, "connect", connect)
    build_hive(ctx.settings)
    assert connect.call_args.kwargs["database_name"] == "neo4j"
