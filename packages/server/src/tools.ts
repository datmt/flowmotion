import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { applyOps, compile, outline, validate, type FlowDoc, type Issue } from "@flowmotion/core";
import type { BlobStore } from "./store.ts";

export class ToolError extends Error {
  constructor(public status: number, public body: Record<string, unknown>) { super(String(body.error)); }
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

/** Dry run: every error and warning, nothing stored. */
export async function check(doc: unknown) {
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

export async function get(c: Ctx, { id, view = "outline", ids }: { id: string; view?: "outline" | "full"; ids?: string[] }) {
  const { doc } = await snapshot(c, id);
  if (ids?.length) {
    const d: any = doc, items: Record<string, unknown> = {};
    const all = [...["nodes", "edges", "groups", "arrays", "grids", "tokens", "code", "scenarios"].flatMap((k) => d[k] ?? []), ...d.scenarios.flatMap((s: any) => s.steps)];
    for (const e of all) { const k = e.id ?? `${e.from}-${e.to}`; if (ids.includes(k)) items[k] = e; }
    return { id, items };
  }
  return view === "full" ? { id, doc } : { id, outline: outline(doc) };
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
export async function edit(c: Ctx, { id, ops }: { id: string; ops: unknown }) {
  const { doc } = await snapshot(c, id);
  return { ...(await publish(c, applyToDoc(doc, ops).doc, id)), from: id };
}
