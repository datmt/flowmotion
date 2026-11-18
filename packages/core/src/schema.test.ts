import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { FlowDoc, flowJsonSchema, parseRef } from "./index.ts";
import { bsearch, saga } from "./fixtures.ts";

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
