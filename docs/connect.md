# Connect an agent to FlowMotion

FlowMotion exposes an MCP server over stateless Streamable HTTP at `POST <PUBLIC_URL>/mcp`. No auth, no session. Default local URL: `http://localhost:3000/mcp` (`PORT`, `PUBLIC_URL` in `.env`). `PUBLIC_URL` must be the address clients can reach, since returned viewer links use it.

## Claude Code

```
claude mcp add --transport http flowmotion http://localhost:3000/mcp
```

## Claude Desktop / claude.ai

Add a custom connector with the `/mcp` URL (it must be publicly reachable for claude.ai). Tool results render in an inline player.

## Cursor / other clients

Any client supporting Streamable HTTP: `{ "mcpServers": { "flowmotion": { "url": "http://localhost:3000/mcp" } } }`

## Clients without MCP

Fetch `GET <base>/llms.txt` (the authoring guide) and use the REST API under `/api`.

## Using it

Tell the agent: "Use the flowmotion MCP: call `flow_guide`, then make an explainer of X." The MCP prompt `explain` (topic, audience) does this for you. The agent's workflow and DSL reference are in [guide.md](guide.md).

Rendering (`flow_preview`, `flow_export`) needs the worker (Chromium + ffmpeg); without it those tools return `not_available`.
