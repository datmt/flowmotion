import { readFileSync, readdirSync } from "node:fs";
import { applyOps, compile, outline, validate, type FlowDoc, type Issue, type Patch } from "@flowmotion/core";
import { rid } from "./auth.ts";
import type { Db } from "./db.ts";

export class ToolError extends Error {
  constructor(public status: number, public body: Record<string, unknown>) { super(String(body.error)); }
}
export interface Ctx { db: Db; workspace: string; baseUrl?: string; author?: "user" | "agent" | "mcp"; client?: string; prompt?: string }

const ROOT = new URL("../../../", import.meta.url);
const SYSTEM = "system";
const url = (c: Ctx, id: string) => `${c.baseUrl ?? ""}/v/${id}`;
const split = (issues: Issue[]) => ({ errors: issues.filter((i) => i.severity === "error"), warnings: issues.filter((i) => i.severity === "warning") });

/** Validates + compiles; throws 422 with every issue on error. */
async function build(input: unknown) {
  const v = validate(input);
  const { compiled, issues } = await compile(v.doc ?? input);
  const { errors, warnings } = split(issues);
  if (!v.ok || !compiled || errors.length) throw new ToolError(422, { error: "invalid", issues: v.ok ? issues : v.issues });
  return { doc: v.doc, compiled, warnings };
}

async function load(c: Ctx, id: string, write = false) {
  const row = (await c.db.query("SELECT * FROM flows WHERE id = $1 AND (workspace_id = $2 OR (public AND NOT $3))", [id, c.workspace, write])).rows[0];
  if (!row) throw new ToolError(404, { error: "not_found", message: `Flow '${id}' not found.` });
  return row as { id: string; doc: FlowDoc; revision: number; title: string };
}

async function store(c: Ctx, id: string, rev: number, doc: FlowDoc, compiled: unknown, forward: Patch[] | null, inverse: Patch[] | null) {
  await c.db.query("INSERT INTO flow_revisions (flow_id, revision, doc, forward, inverse, author_type, client, prompt) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [id, rev, doc, forward, inverse, c.author ?? "agent", c.client ?? null, c.prompt ?? null]);
  await c.db.query("INSERT INTO compiled_cache (flow_id, revision, compiled) VALUES ($1,$2,$3)", [id, rev, compiled]);
}

const result = (c: Ctx, id: string, revision: number, doc: FlowDoc, warnings: Issue[]) =>
  ({ id, revision, url: url(c, id), errors: [] as Issue[], warnings, outline: outline(doc, revision) });

export const guide = () => readFileSync(new URL("docs/guide.md", ROOT), "utf8");

export async function list(c: Ctx, { query }: { query?: string } = {}) {
  const q = query ? `%${query.replace(/[\\%_]/g, "\\$&")}%` : null;
  const { rows } = await c.db.query(
    "SELECT id, title, public, updated_at FROM flows WHERE (workspace_id = $1 OR public) AND ($2::text IS NULL OR title ILIKE $2) ORDER BY updated_at DESC LIMIT 100", [c.workspace, q]);
  return rows.map((r) => ({ ...r, url: url(c, r.id) }));
}

export async function get(c: Ctx, { id, view = "outline", ids }: { id: string; view?: "outline" | "full"; ids?: string[] }) {
  const f = await load(c, id);
  if (ids?.length) {
    const d: any = f.doc, found: Record<string, unknown> = {};
    const all = [...["nodes", "edges", "groups", "arrays", "grids", "tokens", "code", "scenarios"].flatMap((k) => d[k] ?? []),
      ...d.scenarios.flatMap((s: any) => s.steps)];
    for (const e of all) { const k = e.id ?? `${e.from}-${e.to}`; if (ids.includes(k)) found[k] = e; }
    return { id, revision: f.revision, items: found };
  }
  return view === "full" ? { id, revision: f.revision, doc: f.doc } : { id, revision: f.revision, outline: outline(f.doc, f.revision) };
}

export async function create(c: Ctx, { doc, dryRun }: { doc: unknown; dryRun?: boolean }, opts: { id?: string; public?: boolean } = {}) {
  const b = await build(doc);
  const id = opts.id ?? rid(8);
  if (dryRun) return { ...result(c, id, 0, b.doc, b.warnings), url: null, dryRun: true };
  await c.db.query("INSERT INTO flows (id, workspace_id, title, doc, public) VALUES ($1,$2,$3,$4,$5)", [id, c.workspace, b.doc.meta.title, b.doc, !!opts.public]);
  await store(c, id, 1, b.doc, b.compiled, null, null);
  return result(c, id, 1, b.doc, b.warnings);
}

/** Bumps revision only if still at `base` (atomic UPDATE), else 409 with the current outline. */
async function commit(c: Ctx, f: { id: string; revision: number; doc: FlowDoc }, base: number, doc: FlowDoc, forward: Patch[], inverse: Patch[]) {
  const b = await build(doc);
  const rev = base + 1;
  const { rows } = await c.db.query("UPDATE flows SET doc=$1, title=$2, revision=$3, updated_at=now() WHERE id=$4 AND revision=$5 RETURNING 1", [b.doc, b.doc.meta.title, rev, f.id, base]);
  if (!rows.length) return conflict(c, f.id);
  await store(c, f.id, rev, b.doc, b.compiled, forward, inverse);
  return result(c, f.id, rev, b.doc, b.warnings);
}

async function conflict(c: Ctx, id: string): Promise<never> {
  const cur = await load(c, id);
  throw new ToolError(409, { error: "conflict", currentRevision: cur.revision, outline: outline(cur.doc, cur.revision) });
}

export async function edit(c: Ctx, { id, baseRevision, ops }: { id: string; baseRevision: number; ops: unknown }) {
  const f = await load(c, id, true);
  if (f.revision !== baseRevision) return conflict(c, id);
  const r = applyOps(f.doc, ops);
  if (!r.ok) throw new ToolError(422, { error: "invalid", issues: r.issues });
  return commit(c, f, baseRevision, r.doc, r.forward, r.inverse);
}

export async function revert(c: Ctx, { id, toRevision }: { id: string; toRevision: number }) {
  const f = await load(c, id, true);
  const old = (await c.db.query("SELECT doc FROM flow_revisions WHERE flow_id=$1 AND revision=$2", [id, toRevision])).rows[0];
  if (!old) throw new ToolError(404, { error: "not_found", message: `Revision ${toRevision} not found.` });
  const swap = (value: unknown): Patch[] => [{ op: "replace", path: [], value }];
  return commit(c, f, f.revision, old.doc, swap(old.doc), swap(f.doc));
}

export async function compiledFor(db: Db, id: string, rev?: number) {
  const { rows } = await db.query(
    "SELECT c.compiled, c.revision FROM compiled_cache c JOIN flows f ON f.id = c.flow_id WHERE c.flow_id=$1 AND c.revision = COALESCE($2, f.revision)", [id, rev ?? null]);
  if (!rows[0]) throw new ToolError(404, { error: "not_found" });
  return rows[0] as { compiled: unknown; revision: number };
}

/** Public template flows owned by the system workspace; idempotent. */
export async function seedTemplates(db: Db) {
  await db.query("INSERT INTO workspaces (id, name) VALUES ($1, 'FlowMotion templates') ON CONFLICT DO NOTHING", [SYSTEM]);
  const dir = new URL("templates/", ROOT);
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".flow.json"))) {
    const id = "tpl-" + f.replace(".flow.json", "");
    if ((await db.query("SELECT 1 FROM flows WHERE id=$1", [id])).rows.length) continue;
    await create({ db, workspace: SYSTEM, author: "user" }, { doc: JSON.parse(readFileSync(new URL(f, dir), "utf8")) }, { id, public: true });
  }
}
