import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parseDsl, printDsl } from "./index.ts";

const dir = new URL("../../../templates/", import.meta.url);
for (const f of readdirSync(dir).filter((x) => x.endsWith(".flow.json")))
  test(`round-trip ${f}`, () => {
    const doc = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
    const r = parseDsl(printDsl(doc));
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(r.doc).toEqual(doc);
  });

test("exotic values survive: quotes, newlines, '=', empty cells, code, grid, timing", () => {
  const doc: any = {
    version: "2.1", meta: { title: 'A "q"', theme: "dark", aspect: "4:3" }, layout: { algorithm: "tree", direction: "TB" },
    nodes: [{ id: "a", label: "A", kind: "db", pos: { x: 1.5, y: -2 }, state: "active" }, { id: "b", label: "B", kind: "queue", hidden: true }],
    edges: [{ id: "e1", from: "a", to: "b", label: "x y", arrow: false, dashed: true }],
    arrays: [{ id: "arr", values: ["=", "", "a b", "x\"y", "1"], orientation: "column" }],
    grids: [{ id: "g", rows: [["1", "2"], ["3", "4"]], rowLabels: ["r 1", "r2"], colLabels: ["c1", "c2"] }],
    code: [{ id: "c", language: "ts", title: "T", code: "a\n\n  b = \"1\"\n#x" }],
    scenarios: [{ id: "s", title: "S", steps: [{ id: "one", title: "One", hold: 1.5, narration: 'Line "one"\nline two', actions: [
      { do: "focus", targets: [] }, { do: "focus", targets: ["a"], dim: true, start: "with", delay: 0.5, dur: 2, ease: "spring" },
      { do: "values", target: "arr", values: ["1", ""], dur: 1 }, { do: "send", from: "a", to: "b", via: "e1", label: "m" },
      { do: "highlight", target: "c", lines: "1-2,4" }, { do: "swap", a: "arr#0", b: "arr#1" },
    ] }] }],
  };
  const r = parseDsl(printDsl(doc));
  expect(r.issues).toEqual([]);
  expect(r.doc).toEqual(doc);
});

const bad = `flow "T"
nod a "A" service
node b "B" service hiden
edge a b
node c "C" service
scenario s "S"
  step one "One"
    "Narration"
    pulze a
    callout a "oops
   state a active
`;

test("syntax mistakes give line-numbered errors with hints", () => {
  const r = parseDsl(bad);
  expect(r.doc).toBeUndefined();
  const e = r.issues.map((i) => [i.line, i.message, i.hint]);
  expect(e).toEqual([
    [2, "Unknown keyword 'nod'", "Did you mean 'node'?"],
    [3, "Unknown option 'hiden'", "Did you mean 'hidden'?"],
    [4, "Expected '>' between the two ids", "Write `edge a > b`."],
    [9, "Unknown action 'pulze'", "Did you mean 'pulse'?"],
    [10, "Unterminated string", 'Close the string with a matching " .'],
    [11, "Indent must be a multiple of 2 spaces", undefined],
  ]);
});

test("schema and reference issues map back to source lines", () => {
  const head = `flow "T"\nnode a "A" service\nnode b "B" KIND\nedge a > EDGE\nscenario s "S"\n  step one "One"\n    "n"\n    pulse TARGET\n`;
  const lines = (t: string) => parseDsl(t).issues.map((i) => [i.line, i.code]);
  expect(lines(head.replace("KIND", "widget"))).toContainEqual([3, "schema"]);
  const m = lines(head.replace("KIND", "db").replace("EDGE", "zz").replace("TARGET", "nope"));
  expect(m).toContainEqual([4, "unknown_ref"]);
  expect(m).toContainEqual([8, "unknown_ref"]);
});
