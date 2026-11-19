import { expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { compile, parseDsl } from "./index.ts";
import { Action } from "./schema.ts";

const root = new URL("../../../", import.meta.url);
const files = readdirSync(new URL("templates/", root), { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".flow"));

test("catalog is <domain>/<slug>.flow", () => {
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) expect(f, f).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+\.flow$/);
});

test.each(files)("%s has metadata", (f) => {
  const m = parseDsl(readFileSync(new URL(`templates/${f}`, root), "utf8")).doc!.meta;
  expect(m.summary, "summary").toBeTruthy();
  expect(m.tags?.length, "tags").toBeGreaterThan(0);
  expect(m.level, "level").toBeTruthy();
  for (const r of m.related ?? []) expect(files, `related ${r}`).toContain(r + ".flow");
});

test.each(files)("%s compiles with 0 errors and <=1 warning", async (f) => {
  const { issues } = await compile(parseDsl(readFileSync(new URL(`templates/${f}`, root), "utf8")).doc!);
  expect(issues.filter((i) => i.severity === "error")).toEqual([]);
  expect(issues.filter((i) => i.severity === "warning").length).toBeLessThanOrEqual(1);
});

test("guide mentions every action", () => {
  const guide = readFileSync(new URL("docs/guide.md", root), "utf8");
  for (const o of Action.options) expect(guide, o.shape.do.value).toContain(`"do":"${o.shape.do.value}"`);
  expect(guide.length / 4).toBeLessThan(6000);
});
