#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { compile } from "@flowmotion/core";

const { positionals, values } = parseArgs({ allowPositionals: true, options: { json: { type: "boolean" } } });
const [cmd, file] = positionals;
if (cmd !== "validate" || !file) {
  console.error("usage: flowmotion validate <file> [--json]");
  process.exit(2);
}

let input: unknown;
try {
  input = JSON.parse(readFileSync(file, "utf8"));
} catch (e) {
  console.error(`cannot read ${file}: ${(e as Error).message}`);
  process.exit(2);
}

const { issues } = await compile(input);
if (values.json) console.log(JSON.stringify(issues, null, 2));
else for (const i of issues) console.log(`${i.severity} ${i.code} ${i.where}: ${i.message}${i.hint ? ` (${i.hint})` : ""}`);
process.exit(issues.some((i) => i.severity === "error") ? 1 : 0);
