import { expect, test } from "vitest";
import { validate } from "./index.ts";
import { bsearch, saga } from "./fixtures.ts";

const act = (d: any, a: any) => (d.scenarios[0].steps[0].actions = [a]);
// [name, expected code, mutate]
const cases: [string, string, (d: any) => void][] = [
  ["schema", "schema", (d) => (d.nodes[0].kind = "blob")],
  ["duplicate id", "duplicate_id", (d) => (d.nodes[1].id = "client")],
  ["duplicate default edge id", "duplicate_id", (d) => d.edges.push({ from: "client", to: "orch" })],
  ["unknown ref + hint", "unknown_ref", (d) => act(d, { do: "send", from: "orch", to: "paymnt" })],
  ["bad group", "unknown_ref", (d) => (d.nodes[0].group = "nope")],
  ["highlight non-code", "wrong_target_type", (d) => act(d, { do: "highlight", target: "orch", lines: "1" })],
  ["send to non-node", "wrong_target_type", (d) => act(d, { do: "send", from: "orch", to: "services" })],
  ["range in single target", "range_not_allowed", (d) => act(d, { do: "label", target: "nums#1..2", text: "x" })],
  ["grid oob", "cell_out_of_bounds", (d) => act(d, { do: "label", target: "g#5.0", text: "x" })],
  ["keys mismatch", "keys_length_mismatch", (d) => act(d, { do: "values", target: "vars", values: ["1"] })],
  ["no edge", "no_edge", (d) => act(d, { do: "send", from: "client", to: "payment" })],
  ["ambiguous edge", "ambiguous_edge", (d) => { d.edges.push({ id: "e2", from: "client", to: "orch" }); act(d, { do: "send", from: "client", to: "orch" }); }],
  ["swap across owners", "wrong_target_type", (d) => act(d, { do: "swap", a: "nums#0", b: "vars#lo" })],
  ["values on grid", "wrong_target_type", (d) => act(d, { do: "values", target: "g", values: [] })],
  ["move token to range", "range_not_allowed", (d) => act(d, { do: "move", token: "lo", to: "nums#0..2" })],
  ["unknown branch step", "unknown_branch_step", (d) => (d.scenarios[1].branchFrom.afterStep = "zzz")],
  ["branch cycle", "branch_cycle", (d) => (d.scenarios[0].branchFrom = { scenario: "fail", afterStep: "boom" })],
  ["entity limit", "limit_exceeded", (d) => { for (let i = 0; i < 300; i++) d.nodes.push({ id: `n${i}`, label: "x", kind: "state" }); }],
  ["code lines", "limit_exceeded", (d) => (d.code[0].code = "x\n".repeat(81))],
];

test.each(cases)("%s → %s", (_n, code, mut) => {
  const d: any = structuredClone(saga);
  d.arrays = [{ id: "nums", values: ["1", "2", "3"] }, { id: "vars", keys: ["lo", "hi"], values: ["0", "1"] }];
  d.grids = [{ id: "g", rows: [["1", "2"], ["3", "4"]] }];
  d.tokens = [{ id: "lo", at: "orch" }];
  d.code = [{ id: "c", language: "ts", code: "a" }];
  mut(d);
  const r = validate(d);
  expect(r.ok).toBe(false);
  expect(r.issues.some((i) => i.code === code)).toBe(true);
});

test("hint and where", () => {
  const d: any = structuredClone(saga);
  act(d, { do: "send", from: "orch", to: "paymnt" });
  const i = validate(d).issues[0]!;
  expect(i.hint).toBe("Did you mean 'payment'?");
  expect(i.where).toBe("happy › checkout › action 1");
  expect(i.path).toBe("/scenarios/0/steps/0/actions/0/to");
});

test("returns all issues, not just first", () => {
  const d: any = structuredClone(saga);
  d.nodes[2].group = "nope";
  d.scenarios[0].steps[0].actions = [
    { do: "send", from: "orch", to: "paymnt" },
    { do: "highlight", target: "orch", lines: "1" },
  ];
  expect(validate(d).issues.filter((i) => i.severity === "error")).toHaveLength(3);
});

test("PRD examples are valid", () => {
  expect(validate(saga)).toMatchObject({ ok: true, issues: [] });
  expect(validate(bsearch)).toMatchObject({ ok: true, issues: [] });
});

const gridDoc = (a: any) => ({ version: "2.1", meta: { title: "g" }, nodes: [], edges: [], grids: [{ id: "g", rows: [["1", "2", "3"], ["4", "5", "6"]] }],
  scenarios: [{ id: "s", title: "S", steps: [{ id: "a", title: "A", narration: "n", actions: [a] }] }] });
const gcodes = (a: any) => validate(gridDoc(a) as any).issues.map((i) => i.code);
test("grid range ok in targets", () => expect(gcodes({ do: "state", targets: ["g#0.1..1.2"], state: "active" })).toEqual([]));
test("grid range out of bounds", () => expect(gcodes({ do: "state", targets: ["g#0.0..2.2"], state: "active" })).toContain("cell_out_of_bounds"));
test("grid range backwards", () => expect(gcodes({ do: "state", targets: ["g#1.1..0.0"], state: "active" })).toContain("bad_ref"));
test("grid range not allowed as single target", () => expect(gcodes({ do: "label", target: "g#0.0..1.1", text: "x" })).toContain("range_not_allowed"));
