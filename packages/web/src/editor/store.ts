// Editor document store: doc + selection + undo/redo of op batches (patches from core's applyOps).
// Framework-free; React binds with useSyncExternalStore. ponytail: history capped at 200 entries.
import { applyOps, applyPatches, type FlowDoc, type Op, type Patch } from "@flowmotion/core";
import { find } from "./edits.ts";

export interface Entry { label: string; forward: Patch[]; inverse: Patch[] }
export interface Hist { undo: Entry[]; redo: Entry[] }
export interface State { doc: FlowDoc; sel?: string; error?: string; canUndo: boolean; canRedo: boolean }
const CAP = 200;

export function createStore(doc: FlowDoc, hist: Hist = { undo: [], redo: [] }) {
  const undo = [...hist.undo], redo = [...hist.redo];
  const subs = new Set<() => void>();
  let state: State = { doc, canUndo: undo.length > 0, canRedo: redo.length > 0 };
  const set = (next: Partial<State>) => {
    const d = next.doc ?? state.doc, sel = "sel" in next ? next.sel : state.sel;
    state = { doc: d, sel: sel && find(d, sel) ? sel : undefined, error: next.error, canUndo: undo.length > 0, canRedo: redo.length > 0 };
    subs.forEach((f) => f());
  };
  const push = (e: Entry, d: FlowDoc) => { undo.push(e); if (undo.length > CAP) undo.shift(); redo.length = 0; set({ doc: d }); };
  return {
    get: () => state,
    subscribe: (f: () => void) => (subs.add(f), () => void subs.delete(f)),
    hist: (): Hist => ({ undo, redo }),
    select: (sel?: string) => set({ sel }),
    /** Apply one batch as one undo entry. Returns false (and sets `error`) when core rejects it. */
    dispatch(ops: Op[], label: string): boolean {
      if (!ops.length) return false;
      const r = applyOps(state.doc, ops);
      if (!r.ok) return set({ error: r.issues.map((i) => i.message).join("; ") }), false;
      push({ label, forward: r.forward, inverse: r.inverse }, r.doc);
      return true;
    },
    /** Swap in a whole doc (restore a version) as one undo entry. */
    replace(next: FlowDoc, label: string) {
      push({ label, forward: [{ op: "replace", path: [], value: next }], inverse: [{ op: "replace", path: [], value: state.doc }] }, next);
    },
    undo() { const e = undo.pop(); if (e) { redo.push(e); set({ doc: applyPatches(state.doc, e.inverse) as FlowDoc }); } },
    redo() { const e = redo.pop(); if (e) { undo.push(e); set({ doc: applyPatches(state.doc, e.forward) as FlowDoc }); } },
  };
}
export type Store = ReturnType<typeof createStore>;
