import { expect, test } from "vitest";
import { applyOps, applyPatches, outline, validate, type FlowDoc } from "./index.ts";
import { bsearch, saga } from "./fixtures.ts";

const doc = () => validate(structuredClone(saga)).doc as FlowDoc;
const ok = (r: ReturnType<typeof applyOps>) => (expect(r.ok, JSON.stringify(r.issues)).toBe(true), r as Extract<typeof r, { ok: true }>);
const step = (id: string) => ({ id, title: id, narration: "n", actions: [] });

test("upsert inserts and replaces", () => {
  const n = { id: "inv", label: "Inventory", kind: "service" };
  const a = ok(applyOps(doc(), [{ op: "upsert", entity: "node", value: n }]));
  expect(a.doc.nodes.at(-1)).toEqual(n);
  const b = ok(applyOps(a.doc, [{ op: "upsert", entity: "node", value: { ...n, label: "Stock" } }]));
  expect(b.doc.nodes.filter((x) => x.id === "inv")).toHaveLength(1);
  expect(b.doc.nodes.at(-1)!.label).toBe("Stock");
});

test("upsertStep with and without after", () => {
  const a = ok(applyOps(doc(), [{ op: "upsertStep", scenario: "happy", value: step("s2") }]));
  expect(a.doc.scenarios[0]!.steps.map((s) => s.id)).toEqual(["checkout", "s2"]);
  const b = ok(applyOps(a.doc, [{ op: "upsertStep", scenario: "happy", after: "checkout", value: step("mid") }]));
  expect(b.doc.scenarios[0]!.steps.map((s) => s.id)).toEqual(["checkout", "mid", "s2"]);
  const c = ok(applyOps(b.doc, [{ op: "upsertStep", scenario: "happy", value: { ...step("mid"), title: "X" } }]));
  expect(c.doc.scenarios[0]!.steps[1]!.title).toBe("X");
});

test("remove without cascade fails listing referrers; cascade cleans up", () => {
  const r = applyOps(doc(), [{ op: "remove", id: "payment" }]);
  expect(r.ok).toBe(false);
  expect(r.issues.map((i) => i.path)).toContain("/edges/1/to");
  const c = ok(applyOps(doc(), [{ op: "remove", id: "orch", cascade: true }]));
  expect(c.doc.edges).toEqual([]);
  const steps = c.doc.scenarios[0]!.steps;
  expect(steps[0]!.actions).toEqual([]); // send client->orch and state orch both gone; step kept
  expect(steps[0]!.narration).toBeTruthy();
});

test("batch with one bad op changes nothing", () => {
  const d = doc(), before = JSON.stringify(d);
  const r = applyOps(d, [
    { op: "upsert", entity: "node", value: { id: "ok", label: "Ok", kind: "db" } },
    { op: "removeStep", scenario: "happy", step: "nope" },
  ]);
  expect(r.ok).toBe(false);
  expect(JSON.stringify(d)).toBe(before);
  expect(applyOps(d, [{ op: "upsert", entity: "node", value: { id: "x", kind: "db" } }]).ok).toBe(false); // missing label
});

test("inverse restores the original; setMeta/scenario ops", () => {
  const d = doc();
  const r = ok(applyOps(d, [
    { op: "setMeta", value: { title: "New", layout: { direction: "TB" } } },
    { op: "upsert", entity: "node", value: { id: "z", label: "Z", kind: "db" } },
    { op: "removeScenario", id: "fail" },
  ]));
  expect(r.doc.meta.title).toBe("New");
  expect(r.doc.layout).toEqual({ direction: "TB" });
  expect(applyPatches(r.doc, r.inverse)).toEqual(d);
  expect(applyPatches(d, r.forward)).toEqual(r.doc);
});

test("cascade keeps focus [] and trims multi targets; removes tokens on node", () => {
  const d: any = validate(structuredClone(bsearch)).doc;
  d.scenarios[0].steps[0].actions.push({ do: "focus", targets: [] }, { do: "pulse", targets: ["nums#1", "vars#lo"] });
  const r = ok(applyOps(d, [{ op: "remove", id: "nums", cascade: true }]));
  expect(r.doc.tokens).toEqual([]);
  const acts = r.doc.scenarios[0]!.steps[0]!.actions;
  expect(acts.some((a) => a.do === "focus")).toBe(true);
  expect(acts.find((a) => a.do === "pulse")).toMatchObject({ targets: ["vars#lo"] });
});

test("outline of saga", () => {
  expect(outline(doc(), 4)).toMatchInlineSnapshot(`
    "Saga: order checkout  (rev 4, 3 nodes, 2 edges, 2 scenarios)
    groups: services "Services"
    nodes: client[actor] "Client"; orch[service] "Order Saga"; payment[service@services] "Payment"
    edges: client-orch; orch-payment
    scenario happy "Happy path" (3.0s)
      checkout "Checkout" (2)
    scenario fail "What if?" ⑂ happy@checkout (4.8s)
      boom "Boom" (1)"
  `);
});
