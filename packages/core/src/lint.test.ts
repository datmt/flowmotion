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
