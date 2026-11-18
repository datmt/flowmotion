import { expect, test } from "vitest";
import { parseStream, report, type Row } from "./report.ts";

const ok = `<user_data>\n${JSON.stringify({ id: "abc", url: "/v/abc", warnings: [{}, {}] })}\n</user_data>`;
const bad = `<user_data>\n{"error":"invalid"}\n</user_data>`;
const L = (o: unknown) => JSON.stringify(o);

test("parseStream: counts calls to first valid create", () => {
  const use = (id: string, name: string) => L({ type: "assistant", message: { content: [{ type: "tool_use", id, name }] } });
  const res = (id: string, text: string, is_error = false) => L({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text }], is_error }] } });
  const r = parseStream([use("1", "mcp__flowmotion__flow_guide"), res("1", "guide"), use("2", "mcp__flowmotion__flow_create"), res("2", bad, true),
    use("3", "mcp__flowmotion__flow_create"), res("3", ok), L({ type: "result", usage: { output_tokens: 900 } })]);
  expect(r).toMatchObject({ toolCalls: 3, callsToValid: 2, flowId: "abc", url: "/v/abc", warnings: 2, outputTokens: 900 });
});

test("report: pass criteria per client/format", () => {
  const row = (calls: number, valid: number | null, format: string): Row => ({ prompt: "p", client: "cc", format, toolCalls: calls, callsToValid: valid, clarity: 4 });
  const out = report([...Array(10)].map(() => row(4, 1, "dsl")).concat([...Array(10)].map((_, i) => row(8, i ? 2 : null, "json"))));
  expect(out["cc/dsl"].pass).toBe(true);
  expect(out["cc/json"].validWithin3).toBe(0.9);
  expect(out["cc/json"].pass).toBe(false); // median calls 8 > 6
});

test("parseStream: latency to first valid + first preview", () => {
  const use = (id: string, name: string) => L({ type: "assistant", message: { content: [{ type: "tool_use", id, name }] } });
  const res = (id: string, text: string) => L({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text }] }] } });
  const r = parseStream([use("1", "mcp__flowmotion__flow_create"), res("1", ok), use("2", "mcp__flowmotion__flow_preview"), res("2", "png")], [0, 12000, 12500, 18000]);
  expect(r).toMatchObject({ msToValid: 12000, msToPreview: 18000, previews: 1 });
});
