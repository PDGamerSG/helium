import hiveboard as hb
import pytest
from hiveboard.embed import fake_embedding
from hiveboard.queries import cypher_path, list_queries, load_cypher, schema_statements
from neo4j.exceptions import ClientError

REQUIRED = [
    "10_ingest_episode",
    "11_ingest_fact",
    "12_supersede_fact",
    "20_claim_task",
    "21_handoff_task",
    "22_complete_task",
    "30_recall_hybrid",
    "31_belief_at_time",
    "32_why_path",
    "40_skill_retrieve",
    "41_skill_outcome",
    "50_who_knows",
    "51_open_commitments",
    "52_contradictions",
    "60_pagerank_skills",
    "61_wcc_entities",
    "62_pagerank_skills_cypher",
    "63_wcc_entities_cypher",
]


def test_schema_is_idempotent(db, tenant):
    first = hb.ensure_schema(db, tenant)  # the fixture already ran it once
    second = hb.ensure_schema(db, tenant)
    assert first["indexes_created"] == 0 and first["constraints_created"] == 0
    assert second == first
    assert first["indexes_existing"] == len(schema_statements())
    assert first["constraints_existing"] == len(hb.UNIQUE_ID_LABELS)
    indexes = db.graph(tenant).query("SHOW INDEXES YIELD name, type, labelsOrTypes RETURN name, type, labelsOrTypes").result_set
    labels = {row[2][0] for row in indexes if row[2]}
    assert {"Person", "Episode", "Fact", "Task", "Skill", "EmailThread"} <= labels
    assert {"VECTOR", "FULLTEXT", "RANGE"} <= {row[1] for row in indexes}
    assert {"fact_embedding", "episode_text", "person_id"} <= {row[0] for row in indexes}


def test_unique_constraint_rejects_duplicate_ids(db, tenant):
    g = db.graph(tenant)
    g.query("CREATE (:Person {id: 'dup', name: 'A'})")
    with pytest.raises(ClientError, match="already exists"):
        g.query("CREATE (:Person {id: 'dup', name: 'B'})")
    assert g.query("MATCH (p:Person {id: 'dup'}) RETURN count(p)").result_set[0][0] == 1


def test_vector_index_returns_nearest_first_with_cosine_similarity(db, tenant):
    g = db.graph(tenant)
    g.query(
        "CREATE (:Episode {id: 'a', text: 'a', embedding: $a}), (:Episode {id: 'b', text: 'b', embedding: $b})",
        {"a": fake_embedding("ship the UPI flow by Thursday"), "b": fake_embedding("newsletter goes out on Tuesdays")},
    )
    rows = g.ro_query(
        "CALL db.index.vector.queryNodes('episode_embedding', 2, $q) YIELD node, score RETURN node.id, score",
        {"q": fake_embedding("when does the UPI flow ship")},
    ).result_set
    assert [r[0] for r in rows] == ["a", "b"] and all(0.0 <= r[1] <= 1.0 for r in rows) and rows[0][1] > rows[1][1]


def test_every_required_cypher_file_exists_with_header_comment():
    names = list_queries()
    for required in REQUIRED:
        assert required in names, required
    for name in names:
        text = cypher_path(name).read_text(encoding="utf-8")
        assert text.startswith("//"), f"{name} must start with a comment line"
        if name != "00_schema":
            assert load_cypher(name).strip(), name
        assert "vecf32" not in text and "algo." not in text and "hive.score" not in text, name
