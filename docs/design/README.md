# Design documents

Read in this order:

1. [SRS.md](SRS.md): what the system must do and how well; every requirement maps to a test.
2. [use-cases.md](use-cases.md): who does what; the use-case diagram and 14 descriptions.
3. [HLD.md](HLD.md): layers, data flow, the Neo4j feature map, events, agents, security, scaling.
4. [architecture.md](architecture.md): context, container, component, sequence, state and deployment diagrams (Mermaid).
5. [data-schema.md](data-schema.md): the graph schema with types, indexes, file contracts and API payload types.
6. [LLD.md](LLD.md): module by module, the Cypher catalogue, routes, agents, workers, error handling, test map.
7. [pitch.md](pitch.md): positioning, differentiation, value, how Neo4j is used, deck outline. The stage script is [../pitch-neo4j.md](../pitch-neo4j.md).

Diagrams are Mermaid so GitHub renders them; to export PNGs for the deck, paste a block into https://mermaid.live or run `npx -p @mermaid-js/mermaid-cli mmdc -i architecture.md -o architecture.png`.
