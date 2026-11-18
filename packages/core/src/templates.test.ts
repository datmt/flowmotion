import { expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { compile } from "./index.ts";
import { Action } from "./schema.ts";

const root = new URL("../../../", import.meta.url);
const files = readdirSync(new URL("templates/", root)).filter((f) => f.endsWith(".flow.json"));

test("seven templates", () => expect(files.length).toBe(7));

test.each(files)("%s compiles with 0 errors and <=1 warning", async (f) => {
  const { issues } = await compile(JSON.parse(readFileSync(new URL(`templates/${f}`, root), "utf8")));
  expect(issues.filter((i) => i.severity === "error")).toEqual([]);
  expect(issues.filter((i) => i.severity === "warning").length).toBeLessThanOrEqual(1);
});

test("guide mentions every action and every template", () => {
  const guide = readFileSync(new URL("docs/guide.md", root), "utf8");
  for (const o of Action.options) expect(guide, o.shape.do.value).toContain(`"do":"${o.shape.do.value}"`);
  for (const f of files) expect(guide).toContain(f.replace(".flow.json", ""));
  expect(guide.length / 4).toBeLessThan(6000);
});
