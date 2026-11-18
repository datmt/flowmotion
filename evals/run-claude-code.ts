// Usage: node --experimental-strip-types evals/run-claude-code.ts [--format json|dsl|both] [--limit N] [--model M]
// Starts a local server, runs each prompt through `claude -p` with only the flowmotion MCP tools.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { parseStream, type Row } from "./report.ts";

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const formats = arg("format", "both") === "both" ? ["json", "dsl"] : [arg("format")!];
const limit = Number(arg("limit", "999")), model = arg("model");
const port = 3900 + Math.floor(Math.random() * 90);
const HINT: Record<string, string> = {
  json: "Author the flow as JSON: pass `doc` to flow_create; never use `dsl`.",
  dsl: "Author the flow as text: pass `dsl` to flow_create; never use `doc`.",
};

const server = spawn("node", ["--experimental-strip-types", "packages/server/src/main.ts"], { env: { ...process.env, PORT: String(port), RATE_LIMIT_WRITE: "100000", RATE_LIMIT_READ: "100000" }, stdio: "inherit" });
const cfg = `${mkdtempSync(`${tmpdir()}/fm-eval-`)}/mcp.json`;
writeFileSync(cfg, JSON.stringify({ mcpServers: { flowmotion: { type: "http", url: `http://localhost:${port}/mcp` } } }));
for (let i = 0; i < 50 && !(await fetch(`http://localhost:${port}/mcp`).then(() => true, () => false)); i++) await new Promise((r) => setTimeout(r, 200));

/** Run claude, stamping each stdout line with ms since start (for prompt → first valid/preview latency). */
function runClaude(args: string[]) {
  return new Promise<{ lines: string[]; times: number[]; stdout: string; stderr: string; totalMs: number }>((res) => {
    const t0 = Date.now(), c = spawn("claude", args, { stdio: ["ignore", "pipe", "pipe"] });
    const lines: string[] = [], times: number[] = []; let buf = "", stdout = "", stderr = "";
    const kill = setTimeout(() => c.kill(), 600_000);
    c.stdout.on("data", (d) => { const t = Date.now() - t0; stdout += d; buf += d; const parts = buf.split("\n"); buf = parts.pop()!; for (const l of parts) { lines.push(l); times.push(t); } });
    c.stderr.on("data", (d) => (stderr += d));
    c.on("close", () => { clearTimeout(kill); if (buf) { lines.push(buf); times.push(Date.now() - t0); } res({ lines, times, stdout, stderr, totalMs: Date.now() - t0 }); });
  });
}

mkdirSync("evals/results", { recursive: true });
const out = arg("out") ?? `evals/results/${new Date().toISOString().slice(0, 10)}-claude-code.jsonl`;
const done = new Set(existsSync(out) ? readFileSync(out, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).map((r) => `${r.id}/${r.format}`) : []); // resume: skip finished runs
const prompts = (JSON.parse(readFileSync("evals/prompts.json", "utf8")) as { id: string; prompt: string }[]).slice(0, limit);
try {
  for (const p of prompts) for (const format of formats) {
    if (done.has(`${p.id}/${format}`)) continue;
    const args = ["-p", `${p.prompt}\nUse the flowmotion tools (call flow_guide first). ${HINT[format]}`, "--output-format", "stream-json", "--verbose",
      "--mcp-config", cfg, "--strict-mcp-config", "--tools", "", "--allowedTools", "mcp__flowmotion", "--no-session-persistence", ...(model ? ["--model", model] : [])];
    let r, row: Row & { id: string }, retries = 0;
    do { // the model sometimes prints pseudo tool calls as text (0 real calls): harness flake, retry up to 2x
      r = await runClaude(args);
      row = { id: p.id, prompt: p.prompt, client: "claude-code", format, totalMs: r.totalMs, ...parseStream(r.lines, r.times) };
    } while (row.toolCalls === 0 && retries++ < 2);
    (row as any).retries = retries;
    if (row.callsToValid === null) { mkdirSync("evals/results/raw", { recursive: true }); writeFileSync(`evals/results/raw/${p.id}-${format}.log`, r.stdout + r.stderr); }
    appendFileSync(out, JSON.stringify(row) + "\n");
    console.log(p.id, format, `calls=${row.toolCalls} valid@${row.callsToValid} ms=${row.msToValid} prev=${row.previews} warn=${row.warnings} out=${row.outputTokens}`);
  }
} finally { server.kill(); }
console.log("wrote", out);
