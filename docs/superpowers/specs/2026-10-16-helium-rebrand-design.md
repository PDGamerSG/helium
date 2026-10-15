# Helium Rebrand and Repository Build Design

## Goal

Turn the empty `helium` repository into a cohesive, independently branded team-memory product built from the working Neo4j implementation in `minutes-neo4j`, with reviewable history, reproducible setup, and verified API, graph, ingestion, agent, and web behavior.

## Product identity

The product name is **Helium**. Public copy describes Helium as a time-aware memory workspace for teams and their agents. User-facing labels, page metadata, package descriptions, environment examples, service names, CSS tokens, and documentation use Helium language. Existing license text and a focused upstream attribution remain intact.

## Architecture

Helium keeps the source repository's proven boundaries: numbered Cypher queries, a Python `hiveboard` graph package, an `ingest` package, a FastAPI application, a Next.js web application, and data/docs fixtures. The port is split by boundary so every commit adds a coherent, testable slice. Rebranding is done as intentional copy, metadata, and UI work; code imports and public identifiers are renamed only where doing so improves the product contract and does not break internal boundaries.

Neo4j remains the system of record. Tenant databases and `commons` provide isolation, the graph stores provenance and temporal facts, CDC wakes agent workers, and the API/web layers expose memory, coordination, and evidence paths.

## Verification

- Python tests run with `uv run pytest` for packages and API.
- Ruff checks Python sources.
- Web typecheck and lint run from `apps/web`.
- Every feature commit has a focused verification command recorded in the implementation plan.
- The final repository is checked for stale product names in public files, clean working tree, and a 21-commit sequence with timestamps separated by more than 20 minutes.

## Commit sequencing

The implementation uses 21 commits from workspace foundation through final documentation. Commit subjects are imperative, short, and scoped like the `On-Record` reference. Commit metadata uses randomized gaps between 25 and 55 minutes; this records the requested review cadence without waiting in real time.
