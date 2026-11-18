#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { compile, parseDsl, type Issue } from "@flowmotion/core";

const { positionals, values } = parseArgs({ allowPositionals: true, options: { json: { type: "boolean" } } });
const [cmd, file] = positionals;
if (cmd !== "validate" || !file) {
  console.error("usage: flowmotion validate <file.flow|file.json> [--json]");
  process.exit(2);
}

let text: string;
try {
  text = readFileSync(file, "utf8");
} catch (e) {
  console.error(`cannot read ${file}: ${(e as Error).message}`);
  process.exit(2);
}

let issues: (Issue & { line?: number })[];
try {
  if (file.endsWith(".json")) issues = (await compile(JSON.parse(text))).issues;
  else { // anything else is flow DSL text; line-numbered parse issues, then compiler lint when it parsed
    const p = parseDsl(text);
    issues = p.doc ? [...p.issues, ...(await compile(p.doc)).issues] : p.issues;
  }
} catch (e) {
  console.error(`cannot parse ${file}: ${(e as Error).message}`);
  process.exit(2);
}
if (values.json) console.log(JSON.stringify(issues, null, 2));
else for (const i of issues) console.log(`${i.severity} ${i.code} ${i.line ? `line ${i.line}` : i.where}: ${i.message}${i.hint ? ` (${i.hint})` : ""}`);
process.exit(issues.some((i) => i.severity === "error") ? 1 : 0);
