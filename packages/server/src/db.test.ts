import { PGlite } from "@electric-sql/pglite";
import { expect, test } from "vitest";
import { createApp } from "./app.ts";
import { migrate } from "./db.ts";

test("migrations run once on PGlite; flow row round-trips; healthz", async () => {
  const db = new PGlite();
  expect(await migrate(db)).toEqual(["001_init.sql"]);
  expect(await migrate(db)).toEqual([]);

  await db.query("INSERT INTO workspaces (id, name) VALUES ($1, $2)", ["w1", "Test"]);
  const doc = { version: "2.1", meta: { title: "T" }, nodes: [], edges: [] };
  await db.query("INSERT INTO flows (id, workspace_id, title, doc) VALUES ($1, $2, $3, $4)", ["abc", "w1", "T", doc]);
  await db.query("INSERT INTO flow_revisions (flow_id, revision, doc, author_type) VALUES ($1, 1, $2, 'mcp')", ["abc", doc]);
  const { rows } = await db.query("SELECT doc, revision, public FROM flows WHERE id = $1", ["abc"]);
  expect(rows[0]).toEqual({ doc, revision: 1, public: false });

  await expect(db.query("INSERT INTO api_keys (id, workspace_id, hash, prefix, scopes) VALUES ('k','w1','h','p','{admin}')")).rejects.toThrow();

  const server = createApp({ db, env: {} }).listen(0);
  try {
    const { port } = server.address() as { port: number };
    expect(await (await fetch(`http://127.0.0.1:${port}/healthz`)).json()).toEqual({ ok: true });
  } finally { server.close(); }
});
