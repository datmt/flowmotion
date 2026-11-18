import { expect, test } from "vitest";
import { compile } from "./index.ts";
import { bsearch, saga } from "./fixtures.ts";

const codes = async (d: any) => (await compile(d)).issues.filter((i) => i.severity === "warning").map((i) => i.code);
const mut = (base: any, f: (d: any) => void) => { const d = structuredClone(base); f(d); return d; };

test("PRD examples ≤ 1 warning", async () => {
  expect((await codes(saga)).length).toBeLessThanOrEqual(1);
  expect((await codes(bsearch)).length).toBeLessThanOrEqual(1);
});

const cases: [string, (d: any) => void][] = [
  ["empty_step", (d) => d.scenarios[0].steps.push({ id: "e", title: "e", narration: "short", actions: [] })],
  ["long_narration", (d) => (d.scenarios[0].steps[0].narration = "x".repeat(300))],
  ["too_many_reveals", (d) => { d.nodes.push(...Array.from({ length: 8 }, (_, i) => ({ id: `h${i}`, label: "h", kind: "state", hidden: true }))); d.scenarios[0].steps[0].actions = [{ do: "show", targets: d.nodes.slice(-8).map((n: any) => n.id) }]; }],
  ["never_visible", (d) => d.nodes.push({ id: "ghost", label: "g", kind: "state", hidden: true })],
  ["unreferenced", (d) => d.nodes.push({ id: "lonely", label: "l", kind: "state" })],
  ["label_wraps", (d) => (d.nodes[0].label = "W".repeat(40))],
  ["no_focus_large", (d) => d.nodes.push(...Array.from({ length: 16 }, (_, i) => ({ id: `m${i}`, label: "m", kind: "state" })))],
  ["pin_overlap", (d) => { d.nodes[1].pos = { x: 100, y: 100 }; d.nodes[0].pos = { x: 110, y: 110 }; }],
];
test.each(cases)("warns %s", async (code, f) => {
  expect(await codes(mut(saga, f))).toContain(code);
});

test("warns edge_label_over_node on a fan of long labels", async () => {
  const c = await codes(mut(saga, (d) => { d.layout = { edges: "straight" }; const a = d.nodes[0].id; for (let i = 0; i < 8; i++) { d.nodes.push({ id: `f${i}`, label: "f", kind: "state" }); d.edges.push({ from: a, to: `f${i}`, label: "a fairly long edge label" }); } }));
  expect(c).toContain("edge_label_over_node");
});
test("warns diagram_too_small on a very wide diagram", async () => {
  const c = await codes(mut(saga, (d) => { d.layout = { ...d.layout, direction: "LR" }; for (let i = 0; i < 18; i++) { d.nodes.push({ id: `w${i}`, label: "wide node label", kind: "state" }); d.edges.push({ from: i ? `w${i - 1}` : d.nodes[0].id, to: `w${i}` }); } }));
  expect(c).toContain("diagram_too_small");
});
