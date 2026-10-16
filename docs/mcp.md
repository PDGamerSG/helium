# Ask the memory from an MCP client (Cursor, VS Code)

The `hiveboard` package ships an MCP server over stdio with eight tools: `recall` (our hybrid query), `search`
(the `neo4j-graphrag` hybrid retriever), `why`, `belief_at`, `list_tasks`, `claim`, `handoff` and
`open_commitments`. Reads run as read transactions; `claim` and `handoff` write, and because the API tails Neo4j
Change Data Capture, an MCP client claiming a task shows up on the board within a second.

## Cursor

Add to `.cursor/mcp.json` in the repository (or `~/.cursor/mcp.json`), with the repository path and the Neo4j
password from `.env`:

```json
{
  "mcpServers": {
    "helium": {
      "command": "uv",
      "args": ["run", "--directory", "D:/NEO 4J", "--package", "hiveboard", "python", "-m", "hiveboard.mcp_server"],
      "env": {
        "NEO4J_URI": "bolt://localhost:7687",
        "NEO4J_USER": "neo4j",
        "NEO4J_PASSWORD": "helium-dev-password",
        "HIVEBOARD_LOG_LEVEL": "WARNING"
      }
    }
  }
}
```

Reload the window; the eight tools appear in Cursor's MCP settings. Prompts that work in the agent chat:

- "Using the helium tools, search tenant orbit for the UPI flow due date and explain the chain with `why`."
- "Which commitments are open for Priya in tenant orbit?"
- "What did tenant orbit believe about the payments vendor on 10 September 2026?" (`belief_at` with `t_ms` 1789084799000)
- "List submitted tasks in orbit and claim the first one as agent `answer_agent` at its current version." The board
  page shows the claim arriving through CDC.

The embedder of the stdio server is the deterministic hashed fake unless one is injected, so `search` and `recall`
rank by token overlap, not by meaning; the API's endpoints use EmbeddingGemma. For the demo use `why`, `belief_at`,
`open_commitments`, `list_tasks` and `claim`, whose answers do not depend on embeddings.

## VS Code and other clients

VS Code reads `.vscode/mcp.json`, which takes the same `command`, `args` and `env` block under `"servers"`; any other stdio MCP client takes the same block.
