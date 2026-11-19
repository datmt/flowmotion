import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, test } from "vitest";
import { createApp } from "./app.ts";
import { memoryStore } from "./store.ts";

const tpl = JSON.parse(readFileSync(new URL("../../../templates/binary-search.flow.json", import.meta.url), "utf8"));

test("mcp: tools list, create → edit roundtrip, invalid → isError", async () => {
  const server = createApp({ store: memoryStore(), env: { PUBLIC_URL: "http://x" } }).listen(0);
  const client = new Client({ name: "t", version: "0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`)));
    const { tools } = await client.listTools();
    expect(tools.length).toBeLessThanOrEqual(10);
    expect(JSON.stringify(tools.map((t) => t.inputSchema))).not.toContain("$ref");
    expect(tools.find((t) => t.name === "flow_get")?.annotations?.readOnlyHint).toBe(true);

    const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args }) as Promise<any>;
    const a = (await call("flow_create", { doc: tpl })).structuredContent;
    const b = (await call("flow_edit", { id: a.id, ops: [{ op: "setMeta", value: { title: "Renamed" } }] })).structuredContent;
    expect(b.id).not.toBe(a.id);
    expect((await call("flow_get", { id: b.id, view: "full" })).structuredContent.doc.meta.title).toBe("Renamed");
    expect((await call("flow_get", { id: a.id, view: "full" })).structuredContent.doc.meta.title).toBe(tpl.meta.title);

    const bad = await call("flow_create", { doc: { version: "2.1", meta: {}, nodes: [{ id: "a" }, { id: "a" }], edges: [] } });
    expect(bad.isError).toBe(true);
    expect(bad.structuredContent.issues.length).toBeGreaterThan(1);
    // DSL: create from text, read back as text, line-numbered errors with isError
    const dsl = (await call("flow_get", { id: a.id, view: "dsl" })).structuredContent.dsl as string;
    expect(dsl).toContain(`flow ${JSON.stringify(tpl.meta.title)}`);
    const d = (await call("flow_create", { dsl })).structuredContent;
    expect((await call("flow_get", { id: d.id, view: "dsl" })).structuredContent.dsl).toBe(dsl);
    const badDsl = await call("flow_create", { dsl: dsl.replace("scenario ", "scenaro ") });
    expect(badDsl.isError).toBe(true);
    expect(badDsl.structuredContent.issues[0]).toMatchObject({ code: "syntax", line: expect.any(Number) });
    expect((await call("flow_create", { dsl, doc: tpl })).isError).toBe(true);
    expect((await call("flow_edit", { id: a.id, dsl })).structuredContent.id).not.toBe(a.id);
    expect((await call("flow_guide")).content[0].text).toContain("DSL");
    expect((await call("flow_guide")).content[0].text).toContain("FlowDoc");
    expect((await client.getPrompt({ name: "explain", arguments: { topic: "sagas" } })).messages[0]).toBeTruthy();
  } finally { await client.close(); server.close(); }
}, 60_000);

test("mcp app: player resource + tool results carry compiled flow in _meta", async () => {
  const server = createApp({ store: memoryStore(), env: { PUBLIC_URL: "http://x" } }).listen(0);
  const client = new Client({ name: "t", version: "0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`)));
    const uri = "ui://flowmotion/player";
    expect((await client.listResources()).resources.find((r) => r.uri === uri)?.mimeType).toBe("text/html;profile=mcp-app");
    const c = (await client.readResource({ uri })).contents[0] as { mimeType: string; text: string };
    expect(c.mimeType).toBe("text/html;profile=mcp-app");
    expect(c.text).toContain("ui/initialize");
    expect(c.text).not.toContain("elkjs");
    const { tools } = await client.listTools();
    for (const n of ["flow_create", "flow_edit", "flow_preview"]) expect((tools.find((t) => t.name === n)?._meta as any)?.ui?.resourceUri).toBe(uri);
    const r = (await client.callTool({ name: "flow_create", arguments: { doc: tpl } })) as any;
    expect(r._meta.compiled.scenarios.length).toBeGreaterThan(0);
    expect(r._meta.url).toBe(`${r.structuredContent.url}`);
    expect(JSON.stringify(r.content)).not.toContain("tracks"); // model never sees the compiled flow
  } finally { server.close(); }
});

test("flow_icons: postgres → si:postgresql; REST route agrees", async () => {
  const server = createApp({ store: memoryStore(), env: { PUBLIC_URL: "http://x" } }).listen(0);
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const client = new Client({ name: "t", version: "0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    const r = (await client.callTool({ name: "flow_icons", arguments: { query: "postgres" } }) as any).structuredContent;
    expect(r.icons.map((i: any) => i.ref)).toContain("si:postgresql");
    const rest = await (await fetch(`${base}/api/icons?q=postgres&pack=si`)).json() as any;
    expect(rest.icons[0].ref).toBe("si:postgresql");
    expect(rest.icons.every((i: any) => i.ref.startsWith("si:"))).toBe(true);
    expect((await fetch(`${base}/api/icons?q=x&pack=nope`)).status).toBe(422);
  } finally { await client.close(); server.close(); }
});
