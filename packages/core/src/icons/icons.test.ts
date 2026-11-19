import { expect, test } from "vitest";
import { compile } from "../compile.ts";
import { parseDsl, printDsl } from "../dsl.ts";
import { normalizeBody } from "./svg.ts";

const doc = (icon: string) => ({
  version: "2.1", meta: { title: "t" },
  nodes: [{ id: "a", label: "Postgres", kind: "db", icon }, { id: "b", label: "API", kind: "service", icon: "lucide:server" }],
  edges: [{ from: "a", to: "b" }],
  scenarios: [{ id: "s", title: "s", steps: [{ id: "x", title: "x", narration: "n", actions: [] }] }],
});

test("si:postgresql compiles with one icons entry per distinct ref; self-contained", async () => {
  const r = await compile(doc("si:postgresql"));
  expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
  expect(Object.keys(r.compiled!.icons!).sort()).toEqual(["lucide:server", "si:postgresql"]);
  expect(r.compiled!.icons!["si:postgresql"]).toMatchObject({ mono: true });
  expect(r.compiled!.nodes[0]!.icon).toBe("si:postgresql");
  expect(JSON.stringify(r.compiled)).not.toContain("<path"); // normalised: no raw SVG bodies
});

test("unknown icon: error with nearest names", async () => {
  const r = await compile(doc("si:postgre"));
  expect(r.compiled).toBeUndefined();
  expect(r.issues[0]).toMatchObject({ code: "unknown_icon", path: "/nodes/0/icon" });
  expect(r.issues[0]!.hint).toContain("si:postgresql");
  expect((await compile(doc("nope:x"))).issues[0]!.code).toBe("unknown_icon");
});

test("bad icon format fails the schema; local: passes and falls back", async () => {
  expect((await compile(doc("Postgres"))).issues[0]!.code).toBe("schema");
  const r = await compile(doc("local:mine"));
  expect(r.compiled!.icons).toMatchObject({ "lucide:server": expect.anything() });
  expect(r.compiled!.icons!["local:mine"]).toBeUndefined();
});

test("normalizeBody: groups, circles, rects", () => {
  const i = normalizeBody('<g fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><rect x="1" y="1" width="4" height="4"/><polyline points="1 2 3 4"/></g>');
  expect(i.paths).toHaveLength(3);
  expect(i.paths[0]).toMatchObject({ fill: "none", stroke: "currentColor", sw: 2 });
  expect(i.paths[2]!.d).toBe("M1 2L3 4");
  expect(i.mono).toBe(true);
  expect(normalizeBody('<path fill="#f00" d="M0 0"/>').mono).toBe(false);
});

test("DSL round-trips icon=", () => {
  const text = printDsl(doc("si:postgresql") as never);
  expect(text).toContain("icon=si:postgresql");
  expect(parseDsl(text).doc?.nodes[0]?.icon).toBe("si:postgresql");
});
