import { expect, test } from "vitest";
import { compile } from "./compile.ts";
import { parseDsl, printDsl } from "./dsl.ts";

const doc = (tones: (string | undefined)[], groupTone?: string) => ({
  version: "2.1", meta: { title: "t" },
  groups: [{ id: "g", label: "G", ...(groupTone && { tone: groupTone }) }],
  nodes: tones.map((tone, i) => ({ id: `n${i}`, label: `N${i}`, kind: "service", group: "g", ...(tone && { tone }) })),
  edges: tones.slice(1).map((_, i) => ({ from: `n${i}`, to: `n${i + 1}` })),
  scenarios: [{ id: "s", title: "s", steps: [{ id: "x", title: "x", narration: "n", actions: [] }] }],
});

test("tone compiles onto nodes and groups; unknown tone fails the schema", async () => {
  const r = await compile(doc(["primary", "muted", "danger", undefined], "danger"));
  expect(r.compiled!.nodes.map((n) => n.tone)).toEqual(["primary", "muted", "danger", undefined]);
  expect(r.compiled!.groups[0]!.tone).toBe("danger");
  expect((await compile(doc(["loud"]))).issues[0]).toMatchObject({ code: "schema", severity: "error" });
});

test("lint: more than a third primary warns; a third or fewer does not; tiny flows exempt", async () => {
  const w = async (d: unknown) => (await compile(d)).issues.filter((i) => i.code === "tone_overuse");
  expect(await w(doc(["primary", "primary", undefined]))).toHaveLength(1);
  expect(await w(doc(["primary", undefined, undefined]))).toHaveLength(0);
  expect(await w(doc(["primary", "primary"]))).toHaveLength(0);
});

test("DSL round-trips tone on nodes and groups", () => {
  const d = doc(["primary", "danger"], "muted");
  const text = printDsl(d as never);
  expect(text).toContain("tone=primary");
  expect(text).toContain('group g "G" tone=muted');
  const r = parseDsl(text);
  expect(r.doc).toMatchObject({ groups: [{ tone: "muted" }], nodes: [{ tone: "primary" }, { tone: "danger" }] });
});
