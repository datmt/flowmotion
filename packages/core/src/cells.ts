import type { Action, FlowDoc } from "./schema.ts";
import { parseRef } from "./ref.ts";

/** Cell instance model (PLAN §1.2): ids are `<owner>@<n>` (arrays) or `<owner>@<r>.<c>` (grids). */
interface Owner { order: string[]; values: Map<string, string>; next: number; keys?: string[]; cols?: number }
export type CellSim = Map<string, Owner>;

export function createCellSim(doc: FlowDoc): CellSim {
  const sim: CellSim = new Map();
  for (const a of doc.arrays ?? []) {
    const order = a.values.map((_, i) => `${a.id}@${i}`);
    sim.set(a.id, { order, values: new Map(order.map((id, i) => [id, a.values[i]!])), next: order.length, keys: a.keys });
  }
  for (const g of doc.grids ?? []) {
    const order: string[] = [], values = new Map<string, string>();
    g.rows.forEach((row, r) => row.forEach((v, c) => { const id = `${g.id}@${r}.${c}`; order.push(id); values.set(id, v); }));
    sim.set(g.id, { order, values, next: 0, cols: g.rows[0]!.length });
  }
  return sim;
}

/** Instance ids a cell ref points at *right now*; undefined if not a cell ref or out of bounds. */
export function resolveCells(sim: CellSim, ref: string): string[] | undefined {
  const p = parseRef(ref);
  const o = p && sim.get(p.entity);
  if (!p || !o) return undefined;
  switch (p.kind) {
    case "index": return o.order[p.index] ? [o.order[p.index]!] : undefined;
    case "range": {
      const r = o.order.slice(p.from, p.to + 1);
      return p.to < o.order.length ? r : undefined;
    }
    case "key": { const i = o.keys?.indexOf(p.key) ?? -1; return i >= 0 && o.order[i] ? [o.order[i]!] : undefined; }
    case "grid": { const id = o.cols ? o.order[p.row * o.cols + p.col] : undefined; return id ? [id] : undefined; }
    default: return undefined;
  }
}

/** Exchange the slots of two instances (state and value travel with them). */
export function applySwap(sim: CellSim, a: string, b: string): boolean {
  const x = resolveCells(sim, a)?.[0], y = resolveCells(sim, b)?.[0];
  const o = sim.get(parseRef(a)?.entity ?? "");
  if (!x || !y || !o || o !== sim.get(parseRef(b)?.entity ?? "")) return false;
  const i = o.order.indexOf(x), j = o.order.indexOf(y);
  [o.order[i], o.order[j]] = [y, x];
  return true;
}

/** Longest common subsequence as index pairs [oldIdx, newIdx]. */
export function lcs(a: string[], b: string[]): [number, number][] {
  const L = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      L[i]![j] = a[i] === b[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
  const out: [number, number][] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length; )
    if (a[i] === b[j]) out.push([i++, j++]);
    else if (L[i + 1]![j]! >= L[i]![j + 1]!) i++;
    else j++;
  return out;
}

export interface ValuesDiff { kept: { id: string; slot: number }[]; removed: string[]; added: { id: string; slot: number }[] }

/** Replace array contents. Unchanged values keep their instance (LCS); keyed arrays keep every instance. */
export function applyValues(sim: CellSim, owner: string, values: string[]): ValuesDiff | undefined {
  const o = sim.get(owner);
  if (!o) return undefined;
  if (o.keys) {
    o.order.forEach((id, i) => o.values.set(id, values[i] ?? ""));
    return { kept: o.order.map((id, slot) => ({ id, slot })), removed: [], added: [] };
  }
  const pairs = lcs(o.order.map((id) => o.values.get(id)!), values);
  const keptNew = new Map(pairs.map(([i, j]) => [j, o.order[i]!]));
  const removed = o.order.filter((_, i) => !pairs.some(([pi]) => pi === i));
  removed.forEach((id) => o.values.delete(id));
  const kept: ValuesDiff["kept"] = [], added: ValuesDiff["added"] = [];
  o.order = values.map((v, slot) => {
    const old = keptNew.get(slot);
    if (old) return kept.push({ id: old, slot }), old;
    const id = `${owner}@${o.next++}`;
    o.values.set(id, v);
    return added.push({ id, slot }), id;
  });
  return { kept, removed, added };
}

/** Every Ref an action reads, with its path inside the action (for cell-bound checks). */
export function actionRefs(a: Action): { ref: string; path: (string | number)[] }[] {
  switch (a.do) {
    case "state": case "show": case "hide": case "pulse": case "focus":
      return a.targets.map((ref, i) => ({ ref, path: ["targets", i] }));
    case "label": case "callout": return [{ ref: a.target, path: ["target"] }];
    case "move": return [{ ref: a.to, path: ["to"] }];
    case "swap": return [{ ref: a.a, path: ["a"] }, { ref: a.b, path: ["b"] }];
    default: return [];
  }
}
