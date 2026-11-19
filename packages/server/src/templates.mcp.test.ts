import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, test } from "vitest";
import { createApp } from "./app.ts";
import { catalog } from "./catalog.ts";
import { memoryStore } from "./store.ts";


test("every template: flow_create → flow_get roundtrip over MCP", async () => {
  const server = createApp({ store: memoryStore(), env: { PUBLIC_URL: "http://x", RATE_LIMIT_WRITE: "1000" } }).listen(0);
  const client = new Client({ name: "t", version: "0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`)));
    for (const { path: f, doc } of catalog()) {
      const r = (await client.callTool({ name: "flow_create", arguments: { doc } })) as any;
      expect(r.isError, f).toBeFalsy();
      const g = (await client.callTool({ name: "flow_get", arguments: { id: r.structuredContent.id, view: "full" } })) as any;
      expect(g.structuredContent.doc.meta.title, f).toBe(doc.meta.title);
    }
  } finally { await client.close(); server.close(); }
}, 120_000);

test("flow_get reads a catalog template by <domain>/<slug>; unknown path is an error", async () => {
  const server = createApp({ store: memoryStore(), env: { PUBLIC_URL: "http://x" } }).listen(0);
  const client = new Client({ name: "t", version: "0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`)));
    const ok = (await client.callTool({ name: "flow_get", arguments: { id: "security/oauth-pkce", view: "dsl" } })) as any;
    expect(ok.structuredContent.dsl).toContain("flow ");
    const bad = (await client.callTool({ name: "flow_get", arguments: { id: "security/nope" } })) as any;
    expect(bad.isError).toBe(true);
  } finally { await client.close(); server.close(); }
});
