import uuid

import hiveboard as hb
import pytest
from neo4j import READ_ACCESS
from neo4j.exceptions import Neo4jError

from .conftest import cleanup_tenant


@pytest.fixture
def created(db):
    slug = f"test_{uuid.uuid4().hex[:12]}"
    info = hb.create_tenant(db, slug, "Test Team", "rw-secret", "ro-secret")
    yield slug, info
    cleanup_tenant(db, slug)


def _run(driver, database, cypher, params=None, access=None):
    kwargs = {"database": database}
    if access:
        kwargs["default_access_mode"] = access
    with driver.session(**kwargs) as session:
        return [list(r.values()) for r in session.run(cypher, params or {})]


def test_create_tenant_sets_up_database_users_and_registry(db, created):
    slug, info = created
    graph = db.graph_name(slug)
    assert graph == f"team-{slug.replace('_', '-')}" and info["graph"] == graph
    assert info["rw_user"] == f"team_{slug}_rw" and info["ro_user"] == f"team_{slug}_ro"
    assert db.graph_exists(graph) and slug in db.list_tenants() and db.tenant_of(graph) == slug
    assert info["schema"]["constraints_created"] == len(hb.UNIQUE_ID_LABELS)
    rules = hb.acl_rules(db, slug)["rules"]
    assert f"GRANT ROLE team_{slug}_reader TO team_{slug}_ro" in rules
    assert f"GRANT ROLE team_{slug}_writer TO team_{slug}_rw" in rules
    reader = [r for r in rules if f"team_{slug}_reader" in r and r.startswith("GRANT")]
    writer = [r for r in rules if f"team_{slug}_writer" in r and r.startswith("GRANT")]
    assert any(graph in r and "MATCH" in r for r in reader) and any("commons" in r for r in reader)
    assert not any("WRITE" in r for r in reader) and any("WRITE" in r for r in writer)
    assert [t["slug"] for t in hb.list_registered_tenants(db) if t["slug"] == slug] == [slug]
    assert hb.create_tenant(db, slug, "Test Team", "rw-secret", "ro-secret")["graph"] == graph  # idempotent
    with pytest.raises(ValueError):
        hb.create_tenant(db, "Bad Slug!", "x", "a", "b")


def test_ro_user_cannot_write_and_cannot_read_other_tenants(db, created, other_tenant):
    slug, _ = created
    hb.remember_person(db, slug, {"id": "spk_a", "name": "A"})
    # reads through the package go via the ro user and work
    ro_graph = db.ro(slug)
    assert ro_graph.ro_query("MATCH (p:Person) RETURN count(p)").result_set == [[1]]
    assert hb.active_facts(db, slug) == []
    with pytest.raises(Neo4jError):
        ro_graph.query("CREATE (:Person {id: 'spk_b', name: 'B'})")  # a read-only handle runs read transactions
    with pytest.raises(Neo4jError):
        ro_graph.ro_query("CREATE (:Person {id: 'spk_c', name: 'C'})")
    driver = db.user_driver(f"team_{slug}_ro", "ro-secret")
    try:
        with pytest.raises(Neo4jError, match="not allowed"):
            _run(driver, db.graph_name(other_tenant), "MATCH (n) RETURN count(n)")
        assert _run(driver, db.graph_name(slug), "MATCH (p:Person) RETURN p.id", access=READ_ACCESS) == [["spk_a"]]
        with pytest.raises(Neo4jError, match="not allowed"):
            _run(driver, db.graph_name(slug), "CREATE (:Person {id: 'spk_d', name: 'D'})")  # no WRITE privilege
    finally:
        driver.close()
    assert db.graph(slug).query("MATCH (p:Person) RETURN count(p)").result_set == [[1]]


def test_rw_user_is_confined_to_its_database_and_commons(db, created, other_tenant):
    slug, _ = created
    driver = db.user_driver(f"team_{slug}_rw", "rw-secret")
    try:
        assert _run(driver, db.graph_name(slug), "CREATE (:Person {id: 'spk_rw', name: 'RW'}) RETURN 1") == [[1]]
        with pytest.raises(Neo4jError, match="not allowed"):
            _run(driver, db.graph_name(other_tenant), "CREATE (:Person {id: 'x'})")
        with pytest.raises(Neo4jError, match="not allowed"):
            _run(driver, "neo4j", "RETURN 1")
        assert _run(driver, "commons", "MATCH (t:Tenant {slug: $s}) RETURN count(t)", {"s": slug}) == [[1]]
    finally:
        driver.close()


def test_delete_tenant_removes_database_users_and_metadata(db, created):
    slug, _ = created
    graph = db.graph_name(slug)
    hb.remember_person(db, slug, {"id": "spk_a", "name": "A"})
    name = hb.snapshot(db, slug, "before delete")
    assert name.startswith(f"{graph}-snap-") and db.graph_exists(name)
    hb.delete_tenant(db, slug)
    assert not db.graph_exists(graph) and not db.graph_exists(name)
    users = {r[0] for r in db.system().query("SHOW USERS YIELD user RETURN user").result_set}
    assert f"team_{slug}_ro" not in users and f"team_{slug}_rw" not in users
    roles = {r[0] for r in db.system().query("SHOW ROLES YIELD role RETURN role").result_set}
    assert f"team_{slug}_reader" not in roles and f"team_{slug}_writer" not in roles
    assert hb.list_snapshots(db, slug) == [] and slug not in [
        t["slug"] for t in hb.list_registered_tenants(db)
    ]


def test_snapshot_copies_database_and_lists_metadata(db, created):
    slug, _ = created
    hb.remember_person(db, slug, {"id": "spk_a", "name": "A"})
    hb.remember_meeting(db, slug, {"id": "mtg_1", "title": "Kickoff", "started_at": 1})
    hb.remember_episodes(db, slug, "mtg_1", [{"id": "ep1", "seq": 1, "speaker_id": "spk_a", "text": "hi", "t_occurred": 1}])
    name = hb.snapshot(db, slug, "after kickoff")
    hb.remember_person(db, slug, {"id": "spk_b", "name": "B"})
    copy = db.database(name, read_only=True)
    assert copy.ro_query("MATCH (p:Person) RETURN count(p)").result_set == [[1]]
    assert copy.ro_query("MATCH (:Episode {id: 'ep1'})-[:SPOKEN_BY]->(p) RETURN p.id").result_set == [["spk_a"]]
    assert copy.ro_query("MATCH (n:_Copy) RETURN count(n)").result_set == [[0]]
    assert db.graph(slug).ro_query("MATCH (p:Person) RETURN count(p)").result_set == [[2]]
    snaps = hb.list_snapshots(db, slug)
    assert [(s["name"], s["label"], s["exists"]) for s in snaps] == [(name, "after kickoff", True)]
    usage = db.usage(slug)
    assert usage["nodes"] >= 4 and usage["edges"] >= 2 and "raw" in usage


def test_missing_access_users_can_be_restored_without_recreating_database(db, created):
    slug, _ = created
    hb.remember_person(db, slug, {"id": "surviving_record", "name": "Preserved"})
    for user in (db.ro_user(slug), db.rw_user(slug)):
        db.system().query(f"DROP USER {user} IF EXISTS")
    hb.ensure_tenant_access(db, slug, "rw-secret", "ro-secret")
    assert db.ro(slug).ro_query("MATCH (p:Person) RETURN p.name").result_set == [["Preserved"]]


def test_access_recovery_does_not_reenable_or_rotate_existing_users(db, created):
    slug, _ = created
    db.system().query(f"ALTER USER {db.ro_user(slug)} SET STATUS SUSPENDED")
    hb.ensure_tenant_access(db, slug, "different-rw", "different-ro")
    rows = db.system().query("SHOW USERS YIELD user, suspended RETURN user, suspended").result_set
    assert {u: s for u, s in rows}[db.ro_user(slug)] is True
    driver = db.user_driver(db.ro_user(slug), "different-ro")
    try:
        with pytest.raises(Neo4jError):
            _run(driver, db.graph_name(slug), "RETURN 1")
    finally:
        driver.close()
