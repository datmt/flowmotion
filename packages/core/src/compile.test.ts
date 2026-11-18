import { expect, test } from "vitest";
import { compile } from "./index.ts";
import { bsearch, saga } from "./fixtures.ts";

const j = (x: unknown) => JSON.stringify(x, null, 1) + "\n";

test("golden: saga", async () => {
  const r = await compile(saga);
  expect(r.issues).toEqual([]);
  await expect(j(r.compiled)).toMatchFileSnapshot("__golden__/saga.json");
});

test("golden: binary search", async () => {
  const r = await compile(bsearch);
  expect(r.issues).toEqual([]);
  await expect(j(r.compiled)).toMatchFileSnapshot("__golden__/bsearch.json");
});

test("no # refs in compiled output; branches wired; token and cell tracks", async () => {
  const { compiled: c } = await compile(saga);
  expect(JSON.stringify(c)).not.toContain("#");
  const happy = c!.scenarios[0]!, fail = c!.scenarios[1]!;
  expect(happy.steps[0]!.branches).toEqual([{ scenario: "fail", title: "What if?" }]);
  expect(fail.steps[0]).toMatchObject({ id: "checkout", inherited: true });
  expect(fail.steps[0]!.branches).toEqual([{ scenario: "fail", title: "What if?" }].filter(() => false));
  expect(happy.packets[0]).toMatchObject({ edge: "client-orch", reverse: false, label: "PlaceOrder" });
  const b = (await compile(bsearch)).compiled!.scenarios[0]!;
  expect(b.tracks.find((t) => t.target === "lo" && t.prop === "at")!.keys[0]!.to).toEqual({ target: "nums@5" });
  expect(b.cells.length).toBe(9);
});

test("values + swap produce cell tracks", async () => {
  const d: any = structuredClone(bsearch);
  d.scenarios[0].steps[0].actions = [
    { do: "swap", a: "nums#0", b: "nums#1" },
    { do: "values", target: "nums", values: ["5", "2", "8", "NEW"] },
  ];
  const { compiled, issues } = await compile(d);
  expect(issues).toEqual([]);
  const s = compiled!.scenarios[0]!;
  expect(s.tracks.find((t) => t.target === "nums@0" && t.prop === "slot")!.keys.length).toBeGreaterThan(0);
  expect(s.cells.some((x) => x.id === "nums@6")).toBe(true); // 6 initial cells → new instance @6
  expect(s.tracks.find((t) => t.target === "nums@5" && t.prop === "visible")!.keys.at(-1)!.to).toBe(false); // "23" dropped
});

test("focus camera, token send, highlight and code tokens", async () => {
  const d: any = structuredClone(saga);
  d.tokens = [{ id: "tok", at: "client" }];
  d.code = [{ id: "c", language: "typescript", code: "const a = 1;\nlet b = 2;" }];
  d.scenarios[0].steps[0].actions.push(
    { do: "send", from: "client", to: "orch", token: "tok" },
    { do: "focus", targets: ["orch", "payment"], dim: true },
    { do: "highlight", target: "c", lines: "1" },
  );
  const { compiled, issues } = await compile(d);
  expect(issues).toEqual([]);
  const s = compiled!.scenarios[0]!;
  expect(s.camera[0]!.rect!.w / s.camera[0]!.rect!.h).toBeCloseTo(16 / 9);
  expect(s.camera[0]!.dim).toContain("client");
  expect(s.tracks.find((t) => t.target === "tok" && t.prop === "at")!.keys.at(-1)!.to).toEqual({ target: "orch" });
  expect(compiled!.code[0]!.lines).toHaveLength(2);
  expect(compiled!.code[0]!.lines[0]!.some((t) => t.color)).toBe(true);
});

test("300-entity doc compiles < 2s", async () => {
  const d: any = { version: "2.1", meta: { title: "big" }, nodes: [], edges: [], scenarios: [{ id: "s", title: "s", steps: [{ id: "a", title: "a", narration: "n", actions: [] }] }] };
  for (let i = 0; i < 150; i++) d.nodes.push({ id: `n${i}`, label: `Node ${i}`, kind: "service" });
  for (let i = 1; i < 150; i++) d.edges.push({ from: `n${Math.floor(i / 2)}`, to: `n${i}` });
  const t = Date.now();
  const r = await compile(d);
  expect(r.compiled).toBeTruthy();
  expect(Date.now() - t).toBeLessThan(2000);
});
