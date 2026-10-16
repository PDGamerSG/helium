"""The neo4j-graphrag hybrid retriever over the tenant's Fact indexes."""

import hiveboard as hb
from hiveboard import graphrag
from hiveboard.embed import fake_embedding


def test_hybrid_search_returns_the_fact_with_provenance(db, tenant, seeded):
    hb.remember_fact(
        db,
        tenant,
        {
            "subject": "onboarding",
            "predicate": "status",
            "object": "blocked",
            "confidence": 0.7,
            "speaker_id": seeded["priya"],
            "episode_id": "ep3",
            "entity_ids": [seeded["entities"]["onboarding"]],
            "kind": "fact",
            "embedding": fake_embedding("onboarding status blocked"),
        },
    )
    out = graphrag.search(db, tenant, fake_embedding, "when is the UPI flow due?", k=3)
    assert out["retriever"].endswith("HybridCypherRetriever") and out["indexes"] == {"vector": "fact_embedding", "fulltext": "fact_text"}
    assert "db.index.vector.queryNodes" in out["cypher"] and "db.index.fulltext.queryNodes" in out["cypher"]
    assert out["items"] and out["items"][0]["id"] == seeded["fact"]
    first = out["items"][0]
    assert first["speaker"]["name"] == "Priya" and first["meeting"]["title"] == "Kickoff" and first["entities"] == ["UPI flow"]
    assert first["score"] > 0 and first["kind"] == "commitment"
    # Lucene operators in the question do not break the full-text side
    out = graphrag.search(db, tenant, fake_embedding, "UPI flow: due? (yes/no) AND +status", k=2)
    assert [i["id"] for i in out["items"]][:1] == [seeded["fact"]]
