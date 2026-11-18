import { build } from "esbuild";
import { expect, test } from "vitest";
import { compile } from "./index.ts";
import { sample } from "./runtime/index.ts";
import { bsearch, saga } from "./fixtures.ts";

const bs = (await compile(bsearch)).compiled!;
const sg = (await compile(saga)).compiled!;

test("pure: same t twice is deep-equal, regardless of other samples between", () => {
  const a = sample(bs, "main", 2.3);
  sample(bs, "main", 0); sample(bs, "main", 9);
  expect(sample(bs, "main", 2.3)).toEqual(a);
});

test("step boundaries: tokens and states settle", () => {
  const s = bs.scenarios[0]!;
  expect(sample(bs, "main", 0).ents.get("lo")!.x).toBeCloseTo(bs.arrays[0]!.slots[0]!.x + 28);
  const end1 = s.steps[0]!.end; // after probe-1: lo moved to nums#5, nums#0..4 disabled
  const f = sample(bs, "main", end1);
  expect(f.ents.get("lo")!.x).toBeCloseTo(bs.arrays[0]!.slots[5]!.x + 28);
  expect(f.ents.get("nums@0")!.state).toBe("disabled");
  expect(f.ents.get("nums@0")!.stateK).toBe(1);
  expect(f.step).toBe(0); // fixture has one step; index clamps to the last
  expect(f.ents.get("vars@0")!.label).toBe("5");
});

test("packet at mid-time (linear) sits at polyline midpoint; fades; reduced motion drops it", () => {
  const d: any = structuredClone(saga);
  d.scenarios[0].steps[0].actions[0].ease = "linear";
  return compile(d).then(({ compiled }) => {
    const p = compiled!.scenarios[0]!.packets[0]!, e = compiled!.edges.find((x) => x.id === p.edge)!;
    const f = sample(compiled!, "happy", (p.t0 + p.t1) / 2);
    expect(f.packets).toHaveLength(1);
    expect(f.packets[0]!.x).toBeCloseTo(e.labelAt.x, 3);
    expect(f.packets[0]!.y).toBeCloseTo(e.labelAt.y, 3);
    expect(sample(compiled!, "happy", (p.t0 + p.t1) / 2, { reducedMotion: true }).packets).toHaveLength(0);
  });
});

test("branch scenario shares inherited frames; callout and edge-active", () => {
  const a = sample(sg, "happy", 1.0), b = sample(sg, "fail", 1.0);
  expect(b.ents.get("orch")).toEqual(a.ents.get("orch"));
  expect(a.ents.get("client-orch")!.state).toBe("active"); // send in progress
});

test("runtime bundle has no zod / elkjs / shiki", async () => {
  const r = await build({ entryPoints: [new URL("./runtime/index.ts", import.meta.url).pathname], bundle: true, write: false, metafile: true, format: "esm", logLevel: "silent" });
  const inputs = Object.keys(r.metafile.inputs).join("\n");
  expect(inputs).not.toMatch(/zod|elkjs|shiki/);
});
