"""Hybrid retrieval through Neo4j's GraphRAG package (`neo4j-graphrag`).

`HybridCypherRetriever` queries the `fact_embedding` vector index and the `fact_text` full-text index, fuses the
two rankings (naive or linear ranker) and then runs our retrieval query from each hit: the fact's entities,
speaker and source container. It complements `hiveboard.memory.recall` (our own hybrid query with the
recency x importance x similarity policy): this is the retriever the Neo4j ecosystem ships, pointed at the same
indexes, so an answer can cite either path and show the Cypher it ran.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from neo4j_graphrag.embeddings.base import Embedder
from neo4j_graphrag.neo4j_queries import get_search_query
from neo4j_graphrag.retrievers import HybridCypherRetriever
from neo4j_graphrag.types import HybridSearchRanker, SearchType

from .db import HiveDB
from .memory import sanitize_fulltext
from .schema import FULLTEXT_INDEXES, VECTOR_INDEXES

EmbedFn = Callable[[str], list[float]]

RETRIEVAL_QUERY = """
WITH node AS f, score
WHERE coalesce(f.status, 'active') = 'active'
OPTIONAL MATCH (f)-[:ABOUT]->(e:Entity)
OPTIONAL MATCH (f)-[:STATED_BY]->(p:Person)
OPTIONAL MATCH (f)-[:DERIVED_FROM]->(ep:Episode)
OPTIONAL MATCH (c)-[:HAS_EPISODE]->(ep)
RETURN f.id AS id, f.kind AS kind, f.subject AS subject, f.predicate AS predicate, f.object AS object, f.text AS text,
       f.status AS status, f.valid_from AS valid_from, f.due_at AS due_at, score,
       collect(DISTINCT e.name) AS entities, p {.id, .name} AS speaker, ep.id AS episode_id,
       c {.id, .title, .subject, labels: labels(c)} AS container
ORDER BY score DESC
""".strip()


class CallableEmbedder(Embedder):
    """Adapts any `text -> list[float]` function (EmbeddingGemma, the fake hashed embedder) to the package's interface."""

    def __init__(self, fn: EmbedFn) -> None:
        self._fn = fn

    def embed_query(self, text: str) -> list[float]:
        return [float(x) for x in self._fn(text)]


def fact_retriever(db: HiveDB, tenant: str, embed: EmbedFn) -> HybridCypherRetriever:
    """A retriever bound to one tenant database and the Fact indexes."""
    return HybridCypherRetriever(
        db.driver,
        VECTOR_INDEXES["Fact"],
        FULLTEXT_INDEXES["Fact"],
        RETRIEVAL_QUERY,
        embedder=CallableEmbedder(embed),
        # Resolve through HiveDB so Aura single-database mode uses its configured
        # physical database instead of the Enterprise tenant name.
        neo4j_database=db.graph(tenant).name,
    )


def search_cypher(ranker: str = "naive") -> str:
    """The Cypher the retriever runs (vector + full-text union, ranker, then RETRIEVAL_QUERY), for the Why panel."""
    query, _ = get_search_query(SearchType.HYBRID, retrieval_query=RETRIEVAL_QUERY, ranker=HybridSearchRanker(ranker))
    return query


def search(db: HiveDB, tenant: str, embed: EmbedFn, text: str, k: int = 8, ranker: str = "naive") -> dict[str, Any]:
    """Hybrid search for facts: `{items, cypher, retriever, indexes, ranker, k}`. The vector side embeds the raw
    text; the full-text side gets the sanitised token form so Lucene operators in user text cannot break it."""
    retriever = fact_retriever(db, tenant, embed)
    clean = sanitize_fulltext(text) or text
    raw = retriever.get_search_results(query_text=clean, query_vector=[float(x) for x in embed(text)], top_k=int(k), ranker=HybridSearchRanker(ranker))
    items = []
    for record in raw.records:
        row = dict(record)
        container = row.pop("container", None) or {}
        labels = list(container.get("labels") or [])
        row["meeting"] = {"id": container.get("id"), "title": container.get("title")} if "Meeting" in labels else None
        row["thread"] = {"id": container.get("id"), "subject": container.get("subject")} if "EmailThread" in labels else None
        row["entities"] = [e for e in row.get("entities") or [] if e]
        items.append(row)
    return {
        "items": items,
        "cypher": search_cypher(ranker),
        "retriever": "neo4j_graphrag.retrievers.HybridCypherRetriever",
        "indexes": {"vector": VECTOR_INDEXES["Fact"], "fulltext": FULLTEXT_INDEXES["Fact"]},
        "ranker": ranker,
        "k": int(k),
    }
