import { expect, test } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

const todo = new Set(readFileSync(new URL("templates/.articles-todo", root), "utf8").split("\n").filter((l) => l && !l.startsWith("#")));
const slugs = files.map((f) => f.replace(/\.flow$/, ""));
const HEADINGS = ["Why it exists", "How it works", "What goes wrong", "In practice", "Pitfalls", "Further reading"];

test("every flow has an article (.md) unless listed in templates/.articles-todo", () => {
  for (const s of slugs) expect(existsSync(new URL(`templates/${s}.md`, root)), s).toBe(!todo.has(s));
  for (const t of todo) expect(slugs, `todo entry ${t} has no flow`).toContain(t);
});

test.each(slugs.filter((s) => !todo.has(s)))("%s article is well-formed", (s) => {
  const md = readFileSync(new URL(`templates/${s}.md`, root), "utf8");
  expect([...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]), "headings").toEqual(HEADINGS);
  expect(md, "no # title").not.toMatch(/^# /m);
  const words = md.split(/\s+/).length;
  expect(words, "words").toBeGreaterThanOrEqual(300);
  expect(words, "words").toBeLessThanOrEqual(1100);
  const further = md.slice(md.indexOf("## Further reading"));
  for (const u of parseDsl(readFileSync(new URL(`templates/${s}.flow`, root), "utf8")).doc!.meta.sources ?? []) expect(further, `source ${u}`).toContain(u);
});

test("guide mentions every action", () => {
  const guide = readFileSync(new URL("docs/guide.md", root), "utf8");
  for (const o of Action.options) expect(guide, o.shape.do.value).toContain(`"do":"${o.shape.do.value}"`);
  expect(guide.length / 4).toBeLessThan(6000);
});
