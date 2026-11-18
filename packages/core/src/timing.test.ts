import { expect, test } from "vitest";
import { applySwap, applyValues, createCellSim, lcs, resolveCells, scheduleScenario, validate } from "./index.ts";
import { saga } from "./fixtures.ts";

const doc = (steps: any[], extra: any = {}): any => ({
  version: "2.1", meta: { title: "t" }, nodes: [{ id: "a", label: "A", kind: "state" }, { id: "b", label: "B", kind: "state" }], edges: [{ from: "a", to: "b" }],
  arrays: [{ id: "nums", values: ["1", "2", "3"] }, { id: "stack", values: [] }], ...extra,
  scenarios: [{ id: "main", title: "m", steps }],
});
const step = (id: string, actions: any[], hold?: number) => ({ id, title: id, narration: "n", actions, ...(hold !== undefined ? { hold } : {}) });

test("after / with / delay / hold arithmetic", () => {
  const d = doc([
    step("s1", [
      { do: "send", from: "a", to: "b" },                       // 0 → 1.2
      { do: "state", targets: ["a"], state: "active" },        // after: 1.2 → 1.5
      { do: "pulse", targets: ["a"], start: "with", delay: 0.2 }, // with: 1.4 → 2.0
      { do: "show", targets: ["a"], delay: 1, dur: 0.5 },      // after: 2.0+1 → 3.5
    ], 1),
    step("s2", [], 2),                                          // 4.5 → 6.5
  ]);
  const { steps, duration } = scheduleScenario(d, "main");
  const t = steps[0]!.actions.map((a) => [a.t0, a.t1].map((x) => +x.toFixed(2)));
  expect(t).toEqual([[0, 1.2], [1.2, 1.5], [1.4, 2], [3, 3.5]]);
  expect(steps[0]!.end).toBe(4.5);
  expect(steps[1]).toMatchObject({ start: 4.5, end: 6.5 });
  expect(duration).toBe(6.5);
});

test("branch inherits parent time", () => {
  const d: any = structuredClone(saga);
  const parent = scheduleScenario(d, "happy");
  const child = scheduleScenario(d, "fail");
  expect(child.steps[0]).toMatchObject({ inherited: true, start: 0 });
  expect(child.steps[0]!.step.id).toBe("checkout");
  expect(child.steps[1]!.start).toBe(parent.steps[0]!.end);
});

test("push then stack#0 valid only after the push", () => {
  const bad = doc([step("s1", [{ do: "pulse", targets: ["stack#0"] }, { do: "values", target: "stack", values: ["x"] }])]);
  expect(validate(bad).issues.map((i) => i.code)).toEqual(["cell_out_of_bounds"]);
  const good = doc([step("s1", [{ do: "values", target: "stack", values: ["x"] }, { do: "pulse", targets: ["stack#0"] }])]);
  expect(validate(good).ok).toBe(true);
});

test("token initial cell bounds and scenario duration", () => {
  expect(validate(doc([step("s", [])], { tokens: [{ id: "p", at: "nums#9" }] })).issues[0]!.code).toBe("cell_out_of_bounds");
  expect(validate(doc([step("s", [], 30), step("t", [], 30), step("u", [], 30), step("v", [], 30), step("w", [], 30), step("x", [], 30), step("y", [], 1)])).issues[0]!.code).toBe("limit_exceeded");
});

test("swap moves value with instance; LCS keeps unchanged instances", () => {
  const sim = createCellSim(doc([step("s", [])]));
  expect(applySwap(sim, "nums#0", "nums#2")).toBe(true);
  expect(resolveCells(sim, "nums#0")).toEqual(["nums@2"]); // instance (and its state/value) moved to slot 0
  expect(resolveCells(sim, "nums#2")).toEqual(["nums@0"]);

  const s2 = createCellSim(doc([step("s", [])]));
  const diff = applyValues(s2, "nums", ["1", "9", "3", "4"])!; // keep 1,3; drop 2; add 9, 4
  expect(diff.kept).toEqual([{ id: "nums@0", slot: 0 }, { id: "nums@2", slot: 2 }]);
  expect(diff.removed).toEqual(["nums@1"]);
  expect(diff.added.map((a) => a.slot)).toEqual([1, 3]);
  expect(lcs(["a", "b", "c"], ["b", "c", "d"])).toEqual([[1, 0], [2, 1]]);
});
