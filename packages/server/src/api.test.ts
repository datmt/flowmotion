import { template } from "./catalog.ts";
import { expect, test } from "vitest";
import { createApp } from "./app.ts";
import { memoryStore } from "./store.ts";

const tpl = template("algorithms/binary-search");

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

test("og.png: rendered once from the first scenario's last step, then cached; 501 without a renderer", async () => {
  const calls: unknown[][] = [], png = new Uint8Array([137, 80, 78, 71]);
  const renderer = { renderStill: async (...a: unknown[]) => (calls.push(a), png), startExport: () => { throw new Error("n/a"); }, job: () => undefined };
  const server = createApp({ store: memoryStore(), env: { PUBLIC_URL: "http://x" }, renderer }).listen(0);
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const { id } = await (await fetch(`${base}/api/share`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ doc: tpl }) })).json();
    for (let i = 0; i < 2; i++) {
      const r = await fetch(`${base}/api/share/${id}/og.png`);
      expect(r.headers.get("content-type")).toBe("image/png");
      expect(new Uint8Array(await r.arrayBuffer())).toEqual(png);
    }
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe(id);
    expect((await fetch(`${base}/flow-player.js`)).headers.get("access-control-allow-origin")).toBe("*");
  } finally { server.close(); }
  const { call, close } = await serve();
  try { expect((await call("/api/share/aaaaaaaaaaaa/og.png")).status).toBe(404); } finally { close(); }
}, 60_000);

test("share: local: icon falls back with a warning; embedded icons are sanitized and drawn", async () => {
  const server = createApp({ store: memoryStore(), env: { PUBLIC_URL: "http://x" } }).listen(0);
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const doc = { version: "2.1", meta: { title: "t" }, nodes: [{ id: "a", label: "S3", kind: "db", icon: "local:s3" }], edges: [], scenarios: [{ id: "s", title: "s", steps: [{ id: "x", title: "x", narration: "n", actions: [] }] }] };
  const post = (body: unknown) => fetch(`${base}/api/share`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    const plain = await post({ doc });
    expect(plain.status).toBe(201);
    const p = await plain.json() as any;
    expect(p.warnings.map((w: any) => w.code)).toContain("icon_unresolved");
    expect((await (await fetch(`${base}/api/share/${p.id}`)).json() as any).compiled.icons).toBeUndefined();

    const icons = { "local:s3": { w: 48, h: 48, body: '<path fill="#f00" d="M0 0H48V48Z" onclick="x()"/><script>x</script>' } };
    const emb = await post({ doc, icons });
    expect(emb.status).toBe(201);
    const e = await emb.json() as any;
    expect(e.warnings.map((w: any) => w.code)).not.toContain("icon_unresolved");
    const snap = await (await fetch(`${base}/api/share/${e.id}`)).json() as any;
    expect(snap.compiled.icons["local:s3"].paths[0].fill).toBe("#f00");
    expect(JSON.stringify(snap)).not.toContain("onclick");
    expect(snap.doc.nodes[0].icon).toBe("local:s3"); // doc keeps the ref either way

    expect((await post({ doc, icons: { "local:s3": { w: 1, h: 1, body: "<script/>" } } })).status).toBe(422);
    expect((await post({ doc, icons: { "bad ref": { w: 1, h: 1, body: "<path d='M0 0'/>" } } })).status).toBe(422);
  } finally { server.close(); }
});
