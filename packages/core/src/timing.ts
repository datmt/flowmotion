import type { Action, FlowDoc, Step } from "./schema.ts";

export const DEFAULT_HOLD = 1.5;
const DUR: Record<Action["do"], number> = {
  send: 1.2, move: 0.6, swap: 0.6, focus: 0.6, pulse: 0.6, effect: 0.6, values: 0.5,
  state: 0.3, show: 0.3, hide: 0.3, label: 0.3, highlight: 0.3, callout: 0.3,
};

export interface FlatStep { step: Step; inherited: boolean; scenario: string; index: number }
export interface ScheduledAction { action: Action; index: number; t0: number; t1: number }
export interface ScheduledStep extends FlatStep { start: number; end: number; actions: ScheduledAction[] }

/** Parent steps up to and including `afterStep` (inherited), then own steps. Assumes a validated doc (no cycles). */
export function flattenScenario(doc: FlowDoc, id: string, seen = new Set<string>()): FlatStep[] {
  const s = doc.scenarios.find((x) => x.id === id);
  if (!s || seen.has(id)) return [];
  seen.add(id);
  const own = s.steps.map((step, index) => ({ step, inherited: false, scenario: id, index }));
  if (!s.branchFrom) return own;
  const parent = flattenScenario(doc, s.branchFrom.scenario, seen);
  const cut = parent.findIndex((p) => p.step.id === s.branchFrom!.afterStep);
  return [...parent.slice(0, cut + 1).map((p) => ({ ...p, inherited: true })), ...own];
}

export function scheduleScenario(doc: FlowDoc, id: string): { steps: ScheduledStep[]; duration: number } {
  let t = 0;
  const steps = flattenScenario(doc, id).map((f): ScheduledStep => {
    const start = t;
    let prev = { t0: start, t1: start };
    let first = true;
    const actions = f.step.actions.map((action, index): ScheduledAction => {
      const base = first ? start : action.start === "with" ? prev.t0 : prev.t1;
      first = false;
      const t0 = base + (action.delay ?? 0);
      prev = { t0, t1: t0 + (action.dur ?? DUR[action.do]) };
      return { action, index, ...prev };
    });
    const end = Math.max(start, ...actions.map((a) => a.t1)) + (f.step.hold ?? DEFAULT_HOLD);
    t = end;
    return { ...f, start, end, actions };
  });
  return { steps, duration: t };
}
