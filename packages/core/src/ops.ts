import { enablePatches, produceWithPatches, applyPatches, type Patch } from "immer";
import { z } from "zod";
import { FlowDoc, Id, Scenario, Step } from "./schema.ts";
import { validate, type Issue } from "./validate.ts";

enablePatches();
export { applyPatches, type Patch };

const ENTITY = { node: "nodes", edge: "edges", group: "groups", array: "arrays", grid: "grids", token: "tokens", code: "code" } as const;
type Entity = keyof typeof ENTITY;

// ponytail: upsert `value` is parsed loosely here; validate() on the result reports precise
// schema issues with real JSON Pointers. Upgrade to per-entity strict variants if MCP inputSchema needs it.
export const Op = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("upsert"), entity: z.enum(Object.keys(ENTITY) as [Entity, ...Entity[]]), value: z.looseObject({}) }),
  z.strictObject({ op: z.literal("remove"), id: Id, cascade: z.boolean().optional() }),
  z.strictObject({ op: z.literal("upsertStep"), scenario: Id, after: Id.optional(), value: Step }),
  z.strictObject({ op: z.literal("removeStep"), scenario: Id, step: Id }),
  z.strictObject({ op: z.literal("upsertScenario"), value: Scenario }),
  z.strictObject({ op: z.literal("removeScenario"), id: Id }),
  z.strictObject({
    op: z.literal("setMeta"),
    value: z.strictObject({ ...FlowDoc.shape.meta.partial().shape, layout: FlowDoc.shape.layout }),
  }),
]);
export type Op = z.infer<typeof Op>;
export const Ops = z.array(Op).min(1).max(100);

export type ApplyResult =
  | { ok: true; doc: FlowDoc; forward: Patch[]; inverse: Patch[]; issues: Issue[] }
  | { ok: false; issues: Issue[] };

const edgeId = (e: any): string => e.id ?? `${e.from}-${e.to}`;
const idOf = (entity: Entity, v: any): string | undefined => (entity === "edge" ? (v.from && v.to ? edgeId(v) : v.id) : v.id);

/** Entity ids referenced by an action's string fields (`a#3` -> `a`). */
const refsIn = (a: any): string[] =>
  ["targets", "target", "from", "to", "via", "token", "a", "b"].flatMap((k) => (Array.isArray(a[k]) ? a[k] : a[k] ? [a[k]] : [])).map((r: string) => r.split("#")[0]!);

function cascade(d: any, id: string): void {
  const gone = new Set([id]);
  for (const e of d.edges) if (e.from === id || e.to === id) gone.add(edgeId(e));
  for (const t of d.tokens ?? []) if (t.at.split("#")[0] === id) gone.add(t.id);
  for (const k of Object.values(ENTITY)) if (d[k]) d[k] = d[k].filter((e: any) => !gone.has(k === "edges" ? edgeId(e) : e.id));
  for (const k of ["nodes", "arrays", "grids"]) for (const e of d[k] ?? []) if (e.group === id) delete e.group;
  for (const s of d.scenarios) for (const st of s.steps) {
    st.actions = st.actions.flatMap((a: any) => {
      if (Array.isArray(a.targets)) {
        const had = a.targets.length;
        a.targets = a.targets.filter((r: string) => !gone.has(r.split("#")[0]!));
        return had && !a.targets.length ? [] : [a]; // focus [] = full view, keep
      }
      return refsIn(a).some((r) => gone.has(r)) ? [] : [a];
    });
  }
}

export function applyOps(doc: FlowDoc, input: unknown): ApplyResult {
  const parsed = Ops.safeParse(input);
  if (!parsed.success)
    return { ok: false, issues: parsed.error.issues.map((z) => ({ severity: "error", code: "schema", path: "/" + z.path.join("/"), where: `op ${Number(z.path[0]) + 1}`, message: z.message })) };

  const issues: Issue[] = [];
  const [next, forward, inverse] = produceWithPatches(doc, (d: any) => {
    parsed.data.forEach((op, i) => {
      const bad = (code: string, message: string, hint?: string) =>
        issues.push({ severity: "error", code, path: `/${i}`, where: `op ${i + 1} (${op.op})`, message, ...(hint ? { hint } : {}) });
      const scenario = (id: string) => d.scenarios.find((s: any) => s.id === id) ?? void bad("unknown_ref", `scenario '${id}' does not exist.`);
      switch (op.op) {
        case "upsert": {
          const id = idOf(op.entity, op.value);
          if (!id) return bad("schema", `${op.entity} value needs ${op.entity === "edge" ? "'from' and 'to'" : "an 'id'"}.`);
          const key = ENTITY[op.entity];
          const list: any[] = (d[key] ??= []);
          const at = list.findIndex((e) => (op.entity === "edge" ? edgeId(e) : e.id) === id);
          if (at >= 0) list[at] = op.value; else list.push(op.value);
          return;
        }
        case "remove": {
          const found = Object.values(ENTITY).some((k) => d[k]?.some((e: any) => (k === "edges" ? edgeId(e) : e.id) === op.id));
          if (!found) return bad("unknown_ref", `entity '${op.id}' does not exist.`);
          if (op.cascade) return cascade(d, op.id);
          // without cascade, leave dangling refs: validate() lists every referrer path as unknown_ref
          for (const k of Object.values(ENTITY)) if (d[k]) d[k] = d[k].filter((e: any) => (k === "edges" ? edgeId(e) : e.id) !== op.id);
          return;
        }
        case "upsertStep": {
          const s = scenario(op.scenario);
          if (!s) return;
          const at = s.steps.findIndex((x: any) => x.id === op.value.id);
          if (at >= 0) return void (s.steps[at] = op.value);
          if (!op.after) return void s.steps.push(op.value);
          const prev = s.steps.findIndex((x: any) => x.id === op.after);
          if (prev < 0) return bad("unknown_ref", `step '${op.after}' does not exist in scenario '${op.scenario}'.`);
          s.steps.splice(prev + 1, 0, op.value);
          return;
        }
        case "removeStep": {
          const s = scenario(op.scenario);
          if (!s) return;
          const at = s.steps.findIndex((x: any) => x.id === op.step);
          if (at < 0) return bad("unknown_ref", `step '${op.step}' does not exist in scenario '${op.scenario}'.`);
          s.steps.splice(at, 1);
          return;
        }
        case "upsertScenario": {
          const at = d.scenarios.findIndex((x: any) => x.id === op.value.id);
          if (at >= 0) d.scenarios[at] = op.value; else d.scenarios.push(op.value);
          return;
        }
        case "removeScenario": {
          const at = d.scenarios.findIndex((x: any) => x.id === op.id);
          if (at < 0) return bad("unknown_ref", `scenario '${op.id}' does not exist.`);
          d.scenarios.splice(at, 1);
          return;
        }
        case "setMeta": {
          const { layout, ...meta } = op.value;
          Object.assign(d.meta, meta);
          if (layout) d.layout = { ...d.layout, ...layout };
        }
      }
    });
  });
  if (issues.length) return { ok: false, issues };
  const v = validate(next);
  if (!v.ok || v.issues.some((x) => x.severity === "error")) return { ok: false, issues: v.issues };
  return { ok: true, doc: next as FlowDoc, forward, inverse, issues: v.issues };
}
