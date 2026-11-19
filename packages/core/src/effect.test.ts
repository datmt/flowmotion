import { expect, test } from "vitest";
import { compile } from "./compile.ts";
import { parseDsl, printDsl } from "./dsl.ts";
import { sample } from "./runtime/index.ts";

const doc = (name: string) => ({
  version: "2.1", meta: { title: "t" },
  nodes: [{ id: "a", label: "A", kind: "service" }, { id: "b", label: "B", kind: "service" }], edges: [{ from: "a", to: "b" }],
  scenarios: [{ id: "s", title: "s", steps: [{ id: "x", title: "x", narration: "n", actions: [{ do: "effect", targets: ["a", "b"], name, dur: 1 }] }] }],
});

test("effect compiles deterministically and samples progress; unknown name fails", async () => {
  for (const name of ["shake", "grow", "fade", "flash"]) {
    const a = await compile(doc(name)), b = await compile(doc(name));
    expect(a.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(JSON.stringify(a.compiled)).toBe(JSON.stringify(b.compiled));
    expect(a.compiled!.scenarios[0]!.effects).toEqual([{ target: "a", name, t0: 0, t1: 1 }, { target: "b", name, t0: 0, t1: 1 }]);
  }
  const c = (await compile(doc("shake"))).compiled!;
  expect(sample(c, "s", 0.5).effects[0]).toMatchObject({ target: "a", name: "shake", k: 0.5 });
  expect(sample(c, "s", 1.2).effects).toEqual([]); // transient: gone after t1
  expect((await compile(doc("spin"))).issues[0]).toMatchObject({ code: "schema", severity: "error" });
});

test("DSL round-trips effect", () => {
  const text = printDsl(doc("flash") as never);
  expect(text).toContain("effect a,b flash");
  expect(parseDsl(text).doc!.scenarios[0]!.steps[0]!.actions[0]).toMatchObject({ do: "effect", targets: ["a", "b"], name: "flash" });
});
