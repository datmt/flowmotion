import { expect, test } from "vitest";
import { layout } from "./index.ts";
import { bsearch, saga } from "./fixtures.ts";

const overlap = (a: any, b: any) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (c: any, p: any) => c.x >= p.x && c.y >= p.y && c.x + c.w <= p.x + p.w && c.y + c.h <= p.y + p.h;

test("deterministic", async () => {
  expect(await layout(saga as any)).toEqual(await layout(saga as any));
});

test("saga: groups contain children, nodes don't overlap, edges routed", async () => {
  const l = await layout(saga as any);
  const g = l.groups.find((x) => x.id === "services")!;
  expect(inside(l.nodes.find((n) => n.id === "payment")!.rect, g.rect)).toBe(true);
  for (const a of l.nodes) for (const b of l.nodes) if (a !== b) expect(overlap(a.rect, b.rect)).toBe(false);
  expect(l.edges).toHaveLength(2);
  for (const e of l.edges) { expect(e.points.length).toBeGreaterThanOrEqual(4); expect(e.length).toBeGreaterThan(0); }
});

test("arrays sized for max length; slots inside rect", async () => {
  const d: any = structuredClone(bsearch);
  d.scenarios[0].steps[0].actions.push({ do: "values", target: "nums", values: Array(9).fill("1") });
  const l = await layout(d);
  const nums = l.arrays.find((a) => a.id === "nums")!;
  expect(nums.slots).toHaveLength(9); // initial 6, grows to 9
  expect(nums.slots.every((s) => inside(s, nums.rect))).toBe(true);
});

test("pinned node lands at pos and its edges re-route", async () => {
  const d: any = structuredClone(saga);
  d.nodes[1].pos = { x: 500, y: 300 };
  const l = await layout(d);
  const orch = l.nodes.find((n) => n.id === "orch")!.rect, other = l.nodes.find((n) => n.id === "client")!.rect;
  expect(orch.x - other.x).toBeGreaterThan(0);
  const e = l.edges.find((x) => x.id === "client-orch")!;
  expect(e.points).toHaveLength(8); // 3-segment route
});

test("tree + stress algorithms run", async () => {
  for (const algorithm of ["tree", "stress"]) {
    const d: any = structuredClone(saga);
    d.layout = { algorithm };
    const l = await layout(d);
    expect(l.nodes).toHaveLength(3);
  }
});
