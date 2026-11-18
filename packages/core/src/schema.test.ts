import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { FlowDoc, flowJsonSchema, parseRef } from "./index.ts";

// PRD §3.6 examples
const saga = {
  version: "2.1",
  meta: { title: "Saga: order checkout" },
  groups: [{ id: "services", label: "Services" }],
  nodes: [
    { id: "client", label: "Client", kind: "actor" },
    { id: "orch", label: "Order Saga", kind: "service" },
    { id: "payment", label: "Payment", kind: "service", group: "services" },
  ],
  edges: [{ from: "client", to: "orch" }, { from: "orch", to: "payment" }],
  scenarios: [
    { id: "happy", title: "Happy path", steps: [
      { id: "checkout", title: "Checkout", narration: "The client places an order.",
        actions: [{ do: "send", from: "client", to: "orch", label: "PlaceOrder" }, { do: "state", targets: ["orch"], state: "active" }] },
    ] },
    { id: "fail", title: "What if?", branchFrom: { scenario: "happy", afterStep: "checkout" }, steps: [
      { id: "boom", title: "Boom", narration: "It fails.",
        actions: [{ do: "callout", target: "payment", text: "x", start: "with" }] },
    ] },
  ],
};
const bsearch = {
  version: "2.1",
  meta: { title: "Binary search for 23" },
  nodes: [], edges: [],
  arrays: [
    { id: "nums", values: ["2", "5", "8", "12", "16", "23"] },
    { id: "vars", label: "Variables", keys: ["lo", "mid", "hi"], values: ["0", "4", "9"] },
  ],
  tokens: [{ id: "lo", label: "lo", at: "nums#0" }],
  scenarios: [{ id: "main", title: "Find 23", steps: [
    { id: "p1", title: "Probe", narration: "mid = 4.", actions: [
      { do: "pulse", targets: ["nums#4"] },
      { do: "state", targets: ["nums#0..4"], state: "disabled" },
      { do: "move", token: "lo", to: "nums#5" },
      { do: "label", target: "vars#lo", text: "5", start: "with" },
      { do: "highlight", target: "c", lines: "3-5,9" },
    ] },
  ] }],
};

test("PRD examples parse", () => {
  expect(FlowDoc.safeParse(saga).error).toBeUndefined();
  expect(FlowDoc.safeParse(bsearch).error).toBeUndefined();
});

test("invalid samples fail", () => {
  const bad = (f: (d: any) => void) => {
    const d = structuredClone(saga); f(d);
    return FlowDoc.safeParse(d).success;
  };
  expect(bad((d) => (d.nodes[0].id = "Bad_Id"))).toBe(false);
  expect(bad((d) => (d.scenarios[0].steps[0].actions[0].do = "teleport"))).toBe(false);
  expect(bad((d) => (d.extra = 1))).toBe(false);
  expect(bad((d) => (d.scenarios[0].steps[0].actions[1].targets = ["a#"]))).toBe(false);
  expect(bad((d) => (d.nodes[0].label = "x".repeat(41)))).toBe(false);
});

test("JSON Schema fully inlined and closed", () => {
  const s = flowJsonSchema();
  const walk = (n: any) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    expect("$ref" in n || "$defs" in n || "definitions" in n).toBe(false);
    if (n.type === "object" && n.properties) expect(n.additionalProperties).toBe(false);
    Object.values(n).forEach(walk);
  };
  walk(s);
});

test("committed schema/flow-2.1.json is current", () => {
  const f = new URL("../../../schema/flow-2.1.json", import.meta.url);
  expect(JSON.parse(readFileSync(f, "utf8"))).toEqual(flowJsonSchema());
});

test("parseRef", () => {
  expect(parseRef("a")).toEqual({ kind: "entity", entity: "a" });
  expect(parseRef("a#3")).toEqual({ kind: "index", entity: "a", index: 3 });
  expect(parseRef("a#2..5")).toEqual({ kind: "range", entity: "a", from: 2, to: 5 });
  expect(parseRef("a#lo")).toEqual({ kind: "key", entity: "a", key: "lo" });
  expect(parseRef("dp#1.2")).toEqual({ kind: "grid", entity: "dp", row: 1, col: 2 });
  expect(parseRef("A#1")).toBeNull();
});
