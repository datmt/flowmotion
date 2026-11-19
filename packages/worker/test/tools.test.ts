import { parseDsl } from "../../core/src/index.ts";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { build } from "vite";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createApp } from "../../server/src/app.ts";
import { memoryStore } from "../../server/src/store.ts";
import { createWorker } from "../src/worker.ts";

const web = new URL("../../web/", import.meta.url).pathname;
const tpl = parseDsl(readFileSync(new URL("../../../templates/algorithms/binary-search.flow", import.meta.url), "utf8")).doc!;
let server: ReturnType<ReturnType<typeof createApp>["listen"]>, worker: ReturnType<typeof createWorker>, base: string;

beforeAll(async () => {
  await build({ root: web, logLevel: "silent", build: { outDir: `${web}dist`, emptyOutDir: true } });
  const store = memoryStore();
  // the worker needs the port, which exists only after listen: hand the app a late-bound renderer
  const late = { renderStill: (...a: any[]) => (worker.renderStill as any)(...a), startExport: (...a: any[]) => (worker.startExport as any)(...a), job: (id: string) => worker.job(id) };
  server = createApp({ store, env: { PUBLIC_URL: "", WEB_DIST: `${web}dist` }, renderer: late as any }).listen(0);
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  worker = createWorker({ baseUrl: base, store });
}, 180_000);
afterAll(async () => { await worker?.close(); server?.close(); }, 120_000);

test("MCP flow_preview returns an image; flow_export job reaches done with a fetchable url", async () => {
  const client = new Client({ name: "t", version: "0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  try {
    const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args }) as Promise<any>;
    const p = await call("flow_preview", { doc: tpl, step: 1 });
    const img = p.content.find((c: any) => c.type === "image");
    expect(img.mimeType).toBe("image/png");
    expect([...Buffer.from(img.data, "base64").subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
    expect(p.content.find((c: any) => c.type === "text").text).toContain("outline");
    const all = await call("flow_preview", { doc: tpl }); // default: one sheet per scenario
    expect(all.content.filter((c: any) => c.type === "image")).toHaveLength(tpl.scenarios.length);

    expect((await call("flow_export", { doc: tpl, webhookUrl: "http://127.0.0.1/x" })).isError).toBe(true); // private webhook rejected
    const started = (await call("flow_export", { doc: tpl, format: "gif", height: 720, fps: 30 })).structuredContent;
    let j = started;
    for (let i = 0; i < 600 && j.status !== "done" && j.status !== "error"; i++) { await new Promise((r) => setTimeout(r, 500)); j = await (await fetch(`${base}/api/jobs/${started.id}`)).json(); } // REST: /mcp is on the tight write limiter
    expect((await call("flow_job", { id: started.id })).structuredContent.id).toBe(started.id);
    expect(j.error).toBeUndefined();
    expect(j.status).toBe("done");
    const file = await fetch(base + j.url);
    expect(file.headers.get("content-type")).toContain("gif");
    expect(Buffer.from(await file.arrayBuffer()).subarray(0, 3).toString()).toBe("GIF");
  } finally { await client.close(); }
}, 300_000);

test("REST preview returns PNG; unknown job 404", async () => {
  const { id } = await (await fetch(`${base}/api/share`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ doc: tpl }) })).json();
  const r = await fetch(`${base}/api/share/${id}/preview`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  expect(r.headers.get("content-type")).toContain("png");
  expect((await fetch(`${base}/api/jobs/nope`)).status).toBe(404);
}, 60_000);
