// Pure doc → Op builders for the editor. No DOM, no React: unit-tested in test/editor.test.ts.
import type { FlowDoc, NodeKind, Op } from "@flowmotion/core";

const LISTS = [["node", "nodes"], ["array", "arrays"], ["grid", "grids"], ["code", "code"], ["group", "groups"], ["token", "tokens"]] as const;
export type Entity = (typeof LISTS)[number][0] | "edge";
export const edgeId = (e: { id?: string; from: string; to: string }) => e.id ?? `${e.from}-${e.to}`;

export function find(doc: FlowDoc, id: string): { entity: Entity; value: any } | undefined {
  for (const [entity, key] of LISTS) { const value = (doc[key] as any[] | undefined)?.find((x) => x.id === id); if (value) return { entity, value }; }
  const e = doc.edges.find((x) => edgeId(x) === id);
  return e && { entity: "edge", value: e };
}

/** Every id the doc already uses (entities, edges, scenarios, steps): ids are unique document-wide. */
function taken(doc: FlowDoc): Set<string> {
  const s = new Set<string>(doc.edges.map(edgeId));
  for (const m of JSON.stringify(doc).matchAll(/"id":"([^"]+)"/g)) s.add(m[1]!);
  return s;
}
export function uniqueId(doc: FlowDoc, base: string): string {
  const t = taken(doc);
  for (let i = 1; ; i++) if (!t.has(`${base}-${i}`)) return `${base}-${i}`;
}

const PIN = new Set<Entity>(["node", "array", "grid", "code"]);
const LABEL: Partial<Record<Entity, string>> = { node: "label", array: "label", grid: "label", group: "label", edge: "label", token: "label", code: "title" };
const REQUIRED = new Set<Entity>(["node", "group"]);

/** Pin an entity at layout-space `pos` (drag-to-pin). */
export function moveOp(doc: FlowDoc, id: string, pos: { x: number; y: number }): Op | undefined {
  const f = find(doc, id);
  return f && PIN.has(f.entity) ? { op: "upsert", entity: f.entity as any, value: { ...f.value, pos } } : undefined;
}

/** One batch that drops every pin. */
export function relayoutOps(doc: FlowDoc): Op[] {
  const out: Op[] = [];
  for (const [entity, key] of LISTS) for (const v of (doc[key] as any[] | undefined) ?? []) if (v.pos) { const { pos: _, ...rest } = v; out.push({ op: "upsert", entity, value: rest }); }
  return out;
}

export const labelOf = (doc: FlowDoc, id: string): string | undefined => { const f = find(doc, id); const k = f && LABEL[f.entity]; return k ? f.value[k] ?? "" : undefined; };

export function labelOp(doc: FlowDoc, id: string, text: string): Op | undefined {
  const f = find(doc, id), k = f && LABEL[f.entity];
  if (!f || !k || f.value[k] === text) return;
  const { [k]: _, ...rest } = f.value;
  if (!text) return REQUIRED.has(f.entity) ? undefined : { op: "upsert", entity: f.entity, value: rest } as Op;
  return { op: "upsert", entity: f.entity, value: { ...rest, [k]: text } } as Op;
}

export type Addable = NodeKind | "array" | "grid" | "code" | "token";
export function addOp(doc: FlowDoc, what: Addable): { op: Op; id: string } | undefined {
  const base = what === "code" ? "code" : what;
  const id = uniqueId(doc, base), cap = what[0]!.toUpperCase() + what.slice(1);
  switch (what) {
    case "array": return { id, op: { op: "upsert", entity: "array", value: { id, label: cap, values: ["1", "2", "3"] } } };
    case "grid": return { id, op: { op: "upsert", entity: "grid", value: { id, label: cap, rows: [["0", "0"], ["0", "0"]] } } };
    case "code": return { id, op: { op: "upsert", entity: "code", value: { id, language: "ts", code: "// code" } } };
    case "token": {
      const at = doc.nodes[0]?.id ?? doc.arrays?.[0]?.id;
      return at ? { id, op: { op: "upsert", entity: "token", value: { id, label: cap, at } } } : undefined;
    }
    default: return { id, op: { op: "upsert", entity: "node", value: { id, label: cap, kind: what } } };
  }
}

export function connectOp(doc: FlowDoc, from: string, to: string): Op | undefined {
  if (from === to || doc.edges.some((e) => e.from === from && e.to === to)) return;
  return { op: "upsert", entity: "edge", value: { from, to } };
}

export const deleteOp = (id: string): Op => ({ op: "remove", id, cascade: true });
/** Steps mention this entity (so deleting it also removes actions): worth a confirm. */
export const usedInSteps = (doc: FlowDoc, id: string): boolean => { const s = JSON.stringify(doc.scenarios); return s.includes(`"${id}"`) || s.includes(`"${id}#`); };

// — inspector / step editor ops —
/** Merge `patch` into an entity; an `undefined` value removes the key (optional fields). */
export function setOp(doc: FlowDoc, id: string, patch: Record<string, unknown>): Op | undefined {
  const f = find(doc, id);
  if (!f) return;
  const value: any = { ...f.value, ...patch };
  for (const k of Object.keys(patch)) if (patch[k] === undefined) delete value[k];
  return { op: "upsert", entity: f.entity, value } as Op;
}
export const metaOp = (value: { title?: string; summary?: string; theme?: "light" | "dark"; aspect?: "16:9" | "4:3" | "1:1" | "9:16"; layout?: Record<string, string | undefined> }): Op => ({ op: "setMeta", value } as Op);

type Step = FlowDoc["scenarios"][number]["steps"][number];
export const stepOp = (scenario: string, step: Step): Op => ({ op: "upsertStep", scenario, value: step });
export function addStepOp(doc: FlowDoc, scenario: string, after?: string): { op: Op; id: string } {
  const id = uniqueId(doc, "step");
  return { id, op: { op: "upsertStep", scenario, ...(after ? { after } : {}), value: { id, title: "New step", narration: "Describe this step.", actions: [] } } };
}
/** Reorder = replace the scenario (upsertStep can only insert after another step). */
export function moveStepOp(doc: FlowDoc, scenario: string, i: number, dir: -1 | 1): Op | undefined {
  const sc = doc.scenarios.find((s) => s.id === scenario), j = i + dir;
  if (!sc || j < 0 || j >= sc.steps.length) return;
  const steps = [...sc.steps];
  [steps[i], steps[j]] = [steps[j]!, steps[i]!];
  return { op: "upsertScenario", value: { ...sc, steps } };
}
export function addScenarioOp(doc: FlowDoc): { op: Op; id: string } {
  const id = uniqueId(doc, "scenario"), sid = uniqueId(doc, "step");
  return { id, op: { op: "upsertScenario", value: { id, title: "New scenario", steps: [{ id: sid, title: "New step", narration: "Describe this step.", actions: [] }] } } };
}
export type SimpleAction = "state" | "show" | "hide" | "pulse" | "focus" | "label" | "callout";
export const SIMPLE_ACTIONS: SimpleAction[] = ["state", "show", "hide", "pulse", "focus", "label", "callout"];
/** Default action on `target` (the selected entity). Others (send, move, swap, values, highlight) come from the DSL/agent for now. */
export function newAction(what: SimpleAction, target: string): any {
  if (what === "state") return { do: "state", targets: [target], state: "active" };
  if (what === "label" || what === "callout") return { do: what, target, text: "Text" };
  return { do: what, targets: [target] };
}

/** Ids of entities, edges, scenarios and steps that differ between two docs (added, removed or changed). */
export function changedIds(a: FlowDoc, b: FlowDoc): string[] {
  const index = (d: FlowDoc) => {
    const m = new Map<string, string>(), put = (id: string, v: unknown) => m.set(id, JSON.stringify(v));
    for (const [, key] of LISTS) for (const e of (d[key] as any[] | undefined) ?? []) put(e.id, e);
    for (const e of d.edges) put(edgeId(e), e);
    for (const s of d.scenarios) { put(s.id, { ...s, steps: s.steps.map((x) => x.id) }); for (const st of s.steps) put(st.id, st); }
    return m;
  };
  const x = index(a), y = index(b);
  return [...new Set([...x.keys(), ...y.keys()])].filter((k) => x.get(k) !== y.get(k));
}
