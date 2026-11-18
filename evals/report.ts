// Usage: node --experimental-strip-types evals/report.ts evals/results/*.jsonl
import { readFileSync } from "node:fs";

export interface Row {
  prompt: string; client: string; format?: string;
  toolCalls: number; callsToValid: number | null; flowId?: string; url?: string;
  outputTokens?: number; warnings?: number; clarity?: number; // clarity: 1-5, entered by hand
}

const median = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) / 2)] : null);

/** Turn `claude -p --output-format stream-json` lines into a Row (minus prompt/client/format). */
export function parseStream(lines: string[]): Omit<Row, "prompt" | "client"> {
  const calls = new Map<string, string>(); // tool_use id → short tool name
  let toolCalls = 0, authoring = 0, callsToValid: number | null = null, flowId: string | undefined, url: string | undefined, warnings: number | undefined, outputTokens: number | undefined;
  for (const l of lines) {
    let e: any; try { e = JSON.parse(l); } catch { continue; }
    if (e.type === "assistant") {
      for (const c of e.message?.content ?? []) if (c.type === "tool_use") { toolCalls++; calls.set(c.id, String(c.name).replace(/^mcp__flowmotion__/, "")); }
    } else if (e.type === "user") {
      for (const c of e.message?.content ?? []) if (c.type === "tool_result" && calls.has(c.tool_use_id)) {
      const name = calls.get(c.tool_use_id)!;
      if (name !== "flow_create" && name !== "flow_edit") continue;
      authoring++;
      if (c.is_error) continue;
      const text = typeof c.content === "string" ? c.content : (c.content ?? []).map((x: any) => x.text ?? "").join("");
      try {
        const b = JSON.parse(text.match(/<user_data>\n([\s\S]*)\n<\/user_data>/)?.[1] ?? text);
        callsToValid ??= authoring; flowId = b.id; url = b.url; warnings = b.warnings?.length ?? 0;
      } catch { /* unparsable success: ignore */ }
      }
    } else if (e.type === "result") outputTokens = e.usage?.output_tokens;
  }
  return { toolCalls, callsToValid, flowId, url, warnings, outputTokens };
}

/** The four §5.5 pass criteria (the 4th, schema load failure, is judged by hand: rows with toolCalls 0). */
export function summarize(rows: Row[]) {
  const n = rows.length, ok = rows.filter((r) => r.callsToValid !== null && r.callsToValid <= 3);
  const clarity = rows.flatMap((r) => (r.clarity ? [r.clarity] : []));
  const s = {
    n,
    validWithin3: n ? ok.length / n : 0,
    medianCalls: median(rows.filter((r) => r.callsToValid !== null).map((r) => r.toolCalls)),
    medianCallsToValid: median(rows.flatMap((r) => (r.callsToValid === null ? [] : [r.callsToValid]))),
    medianClarity: median(clarity),
    medianOutputTokens: median(rows.flatMap((r) => (r.outputTokens ? [r.outputTokens] : []))),
    medianWarnings: median(rows.flatMap((r) => (r.warnings === undefined ? [] : [r.warnings]))),
    noToolCalls: rows.filter((r) => r.toolCalls === 0).length,
  };
  return { ...s, pass: s.validWithin3 >= 0.9 && (s.medianCalls ?? 99) <= 6 && (s.medianClarity ?? 0) >= 4 && s.noToolCalls === 0 };
}

/** Group rows by client+format. */
export function report(rows: Row[]) {
  const g: Record<string, Row[]> = {};
  for (const r of rows) (g[`${r.client}${r.format ? `/${r.format}` : ""}`] ??= []).push(r);
  return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, summarize(v)]));
}

if (process.argv[1]?.endsWith("report.ts")) {
  const rows = process.argv.slice(2).flatMap((f) => readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row));
  console.table(report(rows));
}
