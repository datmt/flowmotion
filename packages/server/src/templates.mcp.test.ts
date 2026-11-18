import { readdirSync, readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, test } from "vitest";
import { createApp } from "./app.ts";
import { memoryStore } from "./store.ts";

const dir = new URL("../../../templates/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".flow.json"));

test("every template: flow_create → flow_get roundtrip over MCP", async () => {
  const server = createApp({ store: memoryStore(), env: { PUBLIC_URL: "http://x", RATE_LIMIT_WRITE: "1000" } }).listen(0);
  const client = new Client({ name: "t", version: "0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`)));
    for (const f of files) {
      const doc = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
      const r = (await client.callTool({ name: "flow_create", arguments: { doc } })) as any;
      expect(r.isError, f).toBeFalsy();
      const g = (await client.callTool({ name: "flow_get", arguments: { id: r.structuredContent.id, view: "full" } })) as any;
      expect(g.structuredContent.doc.meta.title, f).toBe(doc.meta.title);
    }
  } finally { await client.close(); server.close(); }
}, 120_000);
