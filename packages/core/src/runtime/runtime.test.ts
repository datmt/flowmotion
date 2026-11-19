import { expect, test } from "vitest";
import { StateName, NodeKind } from "../schema.ts";
import { kinds, measure, themes, wrap } from "./index.ts";

test("measure known widths", () => {
  expect(measure("abc", "mono", 10)).toBe(18);
  expect(measure("", "inter", 14)).toBe(0);
  expect(measure("M", "inter", 1000)).toBe(903);
  expect(measure("Hello", "inter-bold", 14)).toBeGreaterThan(measure("Hello", "inter", 14));
  expect(measure("日", "inter", 10)).toBe(10); // wide fallback
});

test("wrap", () => {
  expect(wrap("short", 200, "inter", 14)).toEqual({ lines: ["short"], overflow: false });
  const w = wrap("one two three four five six seven", 90, "inter", 14);
  expect(w.lines).toHaveLength(2);
  expect(w.overflow).toBe(true);
  expect(w.lines[1]!.endsWith("…")).toBe(true);
  expect(wrap("a".repeat(60), 100, "inter", 14, 5).lines.length).toBeGreaterThan(1);
});

test("theme covers every state and kind", () => {
  for (const t of ["light", "dark"] as const)
    for (const s of StateName.options) expect(themes[t].state[s].fill).toMatch(/^#/);
  for (const k of NodeKind.options) expect(kinds[k].shape).toBeTruthy();
});

test("parseMarkdown: article subset, links only http(s)", async () => {
  const { parseMarkdown } = await import("./markdown.ts");
  const b = parseMarkdown("## H\n\nA `c` **b** [x](https://e.com) [y](javascript:1).\n\n- one\n- two\n\n```\n<raw>\n```");
  expect(b.map((x) => x.t)).toEqual(["h", "p", "ul", "pre"]);
  const p = b[1] as { inl: { t: string }[] };
  expect(p.inl.filter((i) => i.t === "a").length).toBe(1);
  expect((b[3] as { s: string }).s).toBe("<raw>");
});
