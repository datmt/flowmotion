import { readdirSync, readFileSync } from "node:fs";

/** Satisfied by both `pg.Pool` and PGlite, so tests run in-process. */
export interface Db {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

const DIR = new URL("../migrations/", import.meta.url);

/** Applies `migrations/*.sql` in name order, once each. Returns names applied. */
export async function migrate(db: Db, dir: URL = DIR): Promise<string[]> {
  await db.query("CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY)");
  const done = new Set((await db.query("SELECT name FROM _migrations")).rows.map((r) => r.name));
  const applied: string[] = [];
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(name)) continue;
    // ponytail: splits on `;` at end of line, one statement per query (PGlite can't multi-statement).
    // Fine for plain DDL; use real dollar-quote-aware splitting if a migration needs function bodies.
    for (const stmt of readFileSync(new URL(name, dir), "utf8").split(/;[ \t]*\n/).map((s) => s.trim()).filter(Boolean))
      await db.query(stmt);
    await db.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
    applied.push(name);
  }
  return applied;
}
