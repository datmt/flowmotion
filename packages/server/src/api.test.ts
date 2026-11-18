import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { createApp } from "./app.ts";
import { memoryStore } from "./store.ts";

const tpl = JSON.parse(readFileSync(new URL("../../../templates/binary-search.flow.json", import.meta.url), "utf8"));

async function serve(env = {}) {
  const server = createApp({ store: memoryStore(), env: { PUBLIC_URL: "http://x", ...env } }).listen(0);
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const call = async (path: string, body?: unknown) => {
    const r = await fetch(base + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text() };
  };
  return { call, close: () => server.close() };
}

test("publish → get; invalid → all issues; edit makes a new id, old intact; stateless ops/validate; static docs", async () => {
  const { call, close } = await serve();
  try {
    const bad = await call("/api/share", { doc: { version: "2.1", meta: {}, nodes: [{ id: "a" }, { id: "a" }], edges: [] } });
    expect(bad.status).toBe(422);
    expect(bad.body.issues.length).toBeGreaterThan(1);

    const p = await call("/api/share", { doc: tpl });
    expect(p.status).toBe(201);
    expect(p.body.url).toBe(`http://x/v/${p.body.id}`);
    const shared = await call(`/api/share/${p.body.id}`);
    expect(shared.body.doc.meta.title).toBe(tpl.meta.title);
    expect(shared.body.compiled.scenarios.length).toBeGreaterThan(0);
    expect((await call("/api/share/aaaaaaaaaaaa")).status).toBe(404);
    expect((await call("/api/share/..%2Fsecret")).status).toBe(404);

    const ops = [{ op: "setMeta", value: { title: "Renamed" } }];
    const e = await call(`/api/share/${p.body.id}/ops`, { ops });
    expect(e.body).toMatchObject({ from: p.body.id });
    expect(e.body.id).not.toBe(p.body.id);
    expect((await call(`/api/share/${e.body.id}`)).body.doc.meta.title).toBe("Renamed");
    expect((await call(`/api/share/${p.body.id}`)).body.doc.meta.title).toBe(tpl.meta.title);
    expect((await call(`/api/share/${p.body.id}/ops`, { ops: [{ op: "remove", id: "nope" }] })).status).toBe(422);

    expect((await call("/api/ops", { doc: tpl, ops })).body.doc.meta.title).toBe("Renamed");
    expect((await call("/api/validate", { doc: tpl })).body.ok).toBe(true);
    expect((await call("/api/validate", { doc: {} })).body.ok).toBe(false);
    expect((await call("/llms.txt")).body).toContain("FlowDoc");
    expect((await call("/schema/flow-2.1.json")).body.$schema).toBeTruthy();
  } finally { close(); }
}, 60_000);

test("writes are rate limited per IP; reads are separate", async () => {
  const { call, close } = await serve({ RATE_LIMIT_WRITE: "2" });
  try {
    expect((await call("/api/validate", { doc: tpl })).status).toBe(200);
    expect((await call("/api/validate", { doc: tpl })).status).toBe(200);
    expect((await call("/api/validate", { doc: tpl })).status).toBe(429);
    expect((await call("/api/share/aaaaaaaaaaaa")).status).toBe(404);
  } finally { close(); }
}, 60_000);
