#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { compile, parseDsl, type Issue } from "@flowmotion/core";

const { positionals, values } = parseArgs({ allowPositionals: true, options: { json: { type: "boolean" }, o: { type: "string", short: "o" }, scenario: { type: "string" }, step: { type: "string" }, format: { type: "string" } } });
const [cmd, file] = positionals;
if (!["validate", "preview", "render"].includes(cmd ?? "") || !file) {
  console.error("usage: flowmotion validate <file.flow|file.json> [--json]\n       flowmotion preview <id|file> [--scenario s] [--step n] [-o out.png]\n       flowmotion render <id|file> [--scenario s] [--format mp4|webm|gif] [-o out.mp4]");
  process.exit(2);
}

if (cmd !== "validate") { // preview/render talk to the public API; a local file is first published as an unlisted immutable snapshot
  const api = process.env.FLOWMOTION_API_URL ?? "http://localhost:3000";
  const die = (m: string): never => { console.error(m); process.exit(1); };
  const call = async (path: string, body?: unknown) => {
    const r = await fetch(api + path, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch((e) => die(`cannot reach ${api}: ${e.message}`));
    if (!r.ok) die(`${path}: ${r.status} ${await r.text()}`);
    return r;
  };
  let id = file;
  if (!/^[a-z2-7]{12}$/.test(file)) {
    const text = readFileSync(file, "utf8");
    id = ((await (await call("/api/share", file.endsWith(".json") ? { doc: JSON.parse(text) } : { dsl: text })).json()) as { id: string }).id;
  }
  const opts = { ...(values.scenario ? { scenario: values.scenario } : {}), ...(values.step ? { step: Number(values.step) } : {}) };
  if (cmd === "preview") {
    const out = values.o ?? "preview.png";
    writeFileSync(out, Buffer.from(await (await call(`/api/share/${id}/preview`, opts)).arrayBuffer()));
    console.log(out);
  } else {
    const format = values.format ?? "mp4", out = values.o ?? `${id}.${format}`;
    let j = (await (await call(`/api/share/${id}/export`, { scenario: opts.scenario, format })).json()) as { id: string; status: string; progress: number; error?: string };
    while (j.status !== "done") {
      if (j.status === "error") die(j.error ?? "export failed");
      process.stderr.write(`\r${Math.round(j.progress * 100)}%`);
      await new Promise((r) => setTimeout(r, 1000));
      j = (await (await call(`/api/jobs/${j.id}`)).json()) as typeof j;
    }
    writeFileSync(out, Buffer.from(await (await call(`/api/jobs/${j.id}/file`)).arrayBuffer()));
    console.log(out);
  }
  process.exit(0);
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
