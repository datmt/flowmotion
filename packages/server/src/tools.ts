import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { applyOps, compile, outline, parseDsl, printDsl, validate, type FlowDoc, type Issue } from "@flowmotion/core";
import type { BlobStore } from "./store.ts";

export class ToolError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown>) { super(String(body.error)); this.status = status; this.body = body; }
}
export interface Ctx { store: BlobStore; baseUrl?: string }

const ROOT = new URL("../../../", import.meta.url);
const A = "abcdefghijklmnopqrstuvwxyz234567";
const newId = () => Array.from(randomBytes(12), (b) => A[b & 31]).join(""); // 12 chars, 60 bits
const ID = /^[a-z2-7]{12}$/;
const key = (id: string) => `flows/${id}.json`;

/** Validates + compiles; throws 422 with every issue on error. */
async function build(input: unknown) {
  const v = validate(input);
  const { compiled, issues } = await compile(v.doc ?? input);
  if (!v.ok || !compiled || issues.some((i) => i.severity === "error")) throw new ToolError(422, { error: "invalid", issues: v.ok ? issues : v.issues });
  return { doc: v.doc, compiled, warnings: issues.filter((i) => i.severity === "warning") };
}

export async function snapshot(c: Ctx, id: string): Promise<{ doc: FlowDoc; compiled: unknown; from?: string }> {
  const raw = ID.test(id) ? await c.store.get(key(id)) : null;
  if (!raw) throw new ToolError(404, { error: "not_found", message: `Flow '${id}' not found.` });
  return JSON.parse(raw);
}

export const guide = () => readFileSync(new URL("docs/guide.md", ROOT), "utf8");

/** A FlowDoc from either an object or DSL text; invalid DSL throws 422 with line-numbered issues. */
export function docOf({ doc, dsl }: { doc?: unknown; dsl?: string }): unknown {
  if (dsl === undefined) return doc;
  if (doc !== undefined) throw new ToolError(422, { error: "invalid", message: "Pass either doc or dsl, not both." });
  const r = parseDsl(dsl);
  if (!r.doc) throw new ToolError(422, { error: "invalid", issues: r.issues });
  return r.doc;
}

/** Dry run: every error and warning, nothing stored. */
export async function check(input: { doc?: unknown; dsl?: string }) {
  let doc: unknown;
  try { doc = docOf(input); } catch (e) { if (e instanceof ToolError && e.body.issues) return { ok: false, errors: e.body.issues, warnings: [] }; throw e; }
  const v = validate(doc);
  const { issues } = await compile(v.doc ?? doc);
  const errors = issues.filter((i) => i.severity === "error");
  return { ok: v.ok && !errors.length, errors: v.ok ? errors : v.issues, warnings: issues.filter((i) => i.severity === "warning"), ...(v.ok && !errors.length ? { outline: outline(v.doc!) } : {}) };
}

export async function publish(c: Ctx, doc: unknown, from?: string) {
  const b = await build(doc);
  const id = newId();
  await c.store.put(key(id), JSON.stringify({ doc: b.doc, compiled: b.compiled, ...(from ? { from } : {}) }));
  return { id, url: `${c.baseUrl ?? ""}/v/${id}`, warnings: b.warnings, outline: outline(b.doc) };
}

export async function get(c: Ctx, { id, view = "outline", ids }: { id: string; view?: "outline" | "full" | "dsl"; ids?: string[] }) {
  const { doc } = await snapshot(c, id);
  if (ids?.length) {
    const d: any = doc, items: Record<string, unknown> = {};
    const all = [...["nodes", "edges", "groups", "arrays", "grids", "tokens", "code", "scenarios"].flatMap((k) => d[k] ?? []), ...d.scenarios.flatMap((s: any) => s.steps)];
    for (const e of all) { const k = e.id ?? `${e.from}-${e.to}`; if (ids.includes(k)) items[k] = e; }
    return { id, items };
  }
  return view === "full" ? { id, doc } : view === "dsl" ? { id, dsl: printDsl(doc) } : { id, outline: outline(doc) };
}

/** Pure: apply ops to a doc the caller holds (local flows). */
export function applyToDoc(doc: unknown, ops: unknown) {
  const v = validate(doc);
  if (!v.ok) throw new ToolError(422, { error: "invalid", issues: v.issues });
  const r = applyOps(v.doc, ops);
  if (!r.ok) throw new ToolError(422, { error: "invalid", issues: r.issues });
  return { doc: r.doc, forward: r.forward, inverse: r.inverse, warnings: r.issues as Issue[], outline: outline(r.doc) };
}

/** Snapshots are immutable: editing publishes a new id and leaves the old one intact. */
export async function edit(c: Ctx, { id, ops, dsl }: { id: string; ops?: unknown; dsl?: string }) {
  const { doc } = await snapshot(c, id);
  if ((ops === undefined) === (dsl === undefined)) throw new ToolError(422, { error: "invalid", message: "Pass exactly one of ops or dsl (dsl replaces the whole flow)." });
  return { ...(await publish(c, dsl !== undefined ? docOf({ dsl }) : applyToDoc(doc, ops).doc, id)), from: id };
}
