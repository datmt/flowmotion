import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { createApp } from "./app.ts";
import { createKey } from "./auth.ts";
import { migrate } from "./db.ts";
import { seedTemplates } from "./tools.ts";

const tpl = JSON.parse(readFileSync(new URL("../../../templates/binary-search.flow.json", import.meta.url), "utf8"));

test("create → edit → 409 → revert; invalid → all issues; scopes; public compiled; seeded templates", async () => {
  const db = new PGlite();
  await migrate(db);
  await seedTemplates(db);
  await seedTemplates(db); // idempotent
  const rw = await createKey(db, "acme");
  const ro = await createKey(db, "acme", ["read"]);
  const server = createApp({ db, env: { PUBLIC_URL: "http://x" } }).listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const call = async (path: string, key: string | null, body?: unknown) => {
      const r = await fetch(base + path, {
        method: body ? "POST" : "GET",
        headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, body: r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text() };
    };

    expect((await call("/api/flows", null)).status).toBe(401);
    const bad = await call("/api/flows", rw, { doc: { version: "2.1", meta: {}, nodes: [{ id: "a" }, { id: "a" }], edges: [] } });
    expect(bad.status).toBe(422);
    expect(bad.body.issues.length).toBeGreaterThan(1);
    expect((await call("/api/flows", ro, { doc: tpl })).status).toBe(403);

    const c = await call("/api/flows", rw, { doc: tpl });
    expect(c.status).toBe(201);
    const { id } = c.body;
    expect(c.body).toMatchObject({ revision: 1, url: `http://x/v/${id}`, errors: [] });
    expect((await call("/api/flows", rw, { doc: tpl, dryRun: true })).body.dryRun).toBe(true);

    const ops = (baseRevision: number, title: string) => ({ baseRevision, ops: [{ op: "setMeta", value: { title } }] });
    const e = await call(`/api/flows/${id}/ops`, rw, ops(1, "Renamed"));
    expect(e.body.revision).toBe(2);
    const stale = await call(`/api/flows/${id}/ops`, rw, ops(1, "Stale"));
    expect(stale.status).toBe(409);
    expect(stale.body.outline).toContain("Renamed");
    expect((await call(`/api/flows/${id}/ops`, rw, { baseRevision: 2, ops: [{ op: "remove", id: "nope" }] })).status).toBe(422);

    const r = await call(`/api/flows/${id}/revert`, rw, { toRevision: 1 });
    expect(r.body.revision).toBe(3);
    expect((await call(`/api/flows/${id}?view=full`, ro)).body.doc.meta.title).toBe(tpl.meta.title);
    expect((await call(`/api/flows/${id}/compiled?rev=2`, null)).body.compiled.meta.title).toBe("Renamed");

    // templates: listed + readable by anyone, not editable
    const list = (await call("/api/flows?query=binary", ro)).body;
    expect(list.map((f: any) => f.id)).toContain("tpl-binary-search");
    expect((await call("/api/flows/tpl-binary-search/ops", rw, ops(1, "x"))).status).toBe(404);
    expect((await call("/llms.txt", null)).body).toContain("FlowDoc");
    expect((await call("/schema/flow-2.1.json", null)).body.$schema).toBeTruthy();
  } finally { server.close(); }
}, 60_000);
