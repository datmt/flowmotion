import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { applyOps, compile, outline, parseDsl, printDsl, validate, type FlowDoc, type Issue } from "@flowmotion/core";
import type { BlobStore } from "./store.ts";

export class ToolError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown>) { super(String(body.error)); this.status = status; this.body = body; }
}
/** Render worker (packages/worker), injected so the server has no hard dependency on Chromium/ffmpeg. */
export interface Renderer {
  renderStill(src: string, scenario?: string, step?: number): Promise<Uint8Array>;
  startExport(src: string, o: { scenario?: string; format?: "mp4" | "webm" | "gif"; height?: 720 | 1080; fps?: 30 | 60; captions?: boolean }): Job;
  job(id: string): Job | undefined;
}
export interface Job { id: string; status: "queued" | "running" | "done" | "error"; progress: number; key?: string; error?: string }
export interface Ctx { store: BlobStore; baseUrl?: string; renderer?: Renderer }

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

const renderer = (c: Ctx) => c.renderer ?? (() => { throw new ToolError(501, { error: "not_available", message: "Rendering is not enabled on this server." }); })();
/** Existing id, or a fresh immutable snapshot of `doc`/`dsl`. */
async function target(c: Ctx, a: { id?: string; doc?: unknown; dsl?: string }) {
  if (a.id) { await snapshot(c, a.id); return { id: a.id, outline: (await get(c, { id: a.id })).outline }; }
  const p = await publish(c, docOf(a));
  return { id: p.id, outline: p.outline, warnings: p.warnings };
}

/** PNG of one step's end frame, or a contact sheet of every step when `step` is omitted. */
export async function preview(c: Ctx, a: { id?: string; doc?: unknown; dsl?: string; scenario?: string; step?: number }) {
  const r = renderer(c), t = await target(c, a);
  const png = await r.renderStill(t.id, a.scenario, a.step);
  return { ...t, url: `${c.baseUrl ?? ""}/v/${t.id}`, png };
}

// ponytail: hostname check only (no DNS resolution), so a rebinding host could still reach private ranges; move to an egress proxy if exposed publicly.
function webhookOk(u: string) {
  try {
    const { protocol, hostname } = new URL(u);
    return /^https?:$/.test(protocol) && !/^(localhost|.*\.local|.*\.internal|\[.*|127\..*|10\..*|192\.168\..*|169\.254\..*|172\.(1[6-9]|2\d|3[01])\..*|0\..*)$/i.test(hostname);
  } catch { return false; }
}
const MAX_SECONDS = 180;

export async function startExport(c: Ctx, a: { id?: string; doc?: unknown; dsl?: string; scenario?: string; format?: "mp4" | "webm" | "gif"; height?: 720 | 1080; fps?: 30 | 60; captions?: boolean; webhookUrl?: string }) {
  const r = renderer(c);
  if (a.webhookUrl !== undefined && !webhookOk(a.webhookUrl)) throw new ToolError(422, { error: "invalid", message: "webhookUrl must be a public http(s) URL." });
  const t = await target(c, a);
  const snap = await snapshot(c, t.id) as { compiled: { scenarios: { id: string; steps: { end: number }[] }[] } };
  const sc = snap.compiled.scenarios.find((s) => !a.scenario || s.id === a.scenario);
  if (!sc) throw new ToolError(422, { error: "invalid", message: `No scenario '${a.scenario}'.` });
  if ((sc.steps.at(-1)?.end ?? 0) > MAX_SECONDS) throw new ToolError(422, { error: "too_long", message: `Exports are capped at ${MAX_SECONDS}s.` });
  const job = r.startExport(t.id, a);
  if (a.webhookUrl) void watch(c, job.id).then((j) => fetch(a.webhookUrl!, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(j), signal: AbortSignal.timeout(10_000) }).catch(() => {}));
  return jobView(c, job);
}

const jobView = (c: Ctx, j: Job) => ({ id: j.id, status: j.status, progress: j.progress, ...(j.error ? { error: j.error } : {}), ...(j.status === "done" ? { url: `${c.baseUrl ?? ""}/api/jobs/${j.id}/file` } : {}) });
export function job(c: Ctx, id: string) {
  const j = renderer(c).job(id);
  if (!j) throw new ToolError(404, { error: "not_found", message: `Job '${id}' not found.` });
  return jobView(c, j);
}
/** Polls until the job finishes (ponytail: 500 ms poll instead of an event emitter). */
export async function watch(c: Ctx, id: string, onTick?: (j: ReturnType<typeof job>) => void, signal?: AbortSignal) {
  while (!signal?.aborted) {
    const j = job(c, id);
    onTick?.(j);
    if (j.status === "done" || j.status === "error") return j;
    await new Promise((r) => setTimeout(r, 500));
  }
  return job(c, id);
}
export async function jobFile(c: Ctx, id: string) {
  const j = renderer(c).job(id);
  const bytes = j?.status === "done" && j.key ? await c.store.getBytes(j.key) : null;
  if (!j || !bytes) throw new ToolError(404, { error: "not_found", message: "No finished output for this job." });
  return { bytes, ext: j.key!.split(".").pop()! };
}
