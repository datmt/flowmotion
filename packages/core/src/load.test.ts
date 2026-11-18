import { expect, test } from "vitest";
import { compile } from "./index.ts";

// Load check: a doc at the 300-entity limit compiles, in budget. (60 fps playback is a manual dev-page check.)
test("300-entity doc compiles under 5s", async () => {
  const nodes = Array.from({ length: 150 }, (_, i) => ({ id: `n${i}`, kind: "service", label: `Node ${i}` }));
  const edges = Array.from({ length: 149 }, (_, i) => ({ id: `e${i}`, from: `n${i}`, to: `n${i + 1}` }));
  const steps = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, title: `Step ${i}`, narration: "x", actions: [{ do: "pulse", targets: [`n${i}`] }] }));
  const doc = { version: "2.1", meta: { title: "load" }, nodes, edges, scenarios: [{ id: "main", title: "m", steps }] };
  const t = performance.now();
  const { compiled, issues } = await compile(doc);
  expect(issues.filter((i) => i.severity === "error")).toEqual([]);
  expect(compiled).toBeTruthy();
  expect(performance.now() - t).toBeLessThan(5000);
}, 20_000);
