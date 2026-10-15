from hiveboard.queries import cypher_path, list_queries, load_cypher, schema_statements


def test_query_catalog_contains_memory_coordination_and_search_contracts():
    names = list_queries()
    required = {
        "00_schema",
        "10_ingest_episode",
        "11_ingest_fact",
        "20_claim_task",
        "21_handoff_task",
        "30_recall_hybrid",
        "31_belief_at_time",
        "32_why_path",
        "40_skill_retrieve",
        "50_who_knows",
        "60_pagerank_skills",
    }
    assert required <= set(names)
    assert len(names) >= 40


def test_query_loader_strips_comments_and_keeps_parameters():
    schema = schema_statements()
    assert schema
    assert all(line.strip() and not line.lstrip().startswith("//") for line in schema)
    text = load_cypher("10_ingest_episode")
    assert "MERGE" in text
    assert "$container_id" in text
    assert "//" not in text


def test_query_paths_are_numbered_and_start_with_attribution_comment():
    for name in list_queries():
        path = cypher_path(name)
        assert path.name.startswith(tuple(f"{i:02d}_" for i in range(100)))
        assert path.read_text(encoding="utf-8").startswith("//")
