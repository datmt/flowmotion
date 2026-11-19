import Anthropic from "@anthropic-ai/sdk";
import { outline, parseDsl, printDsl, type FlowDoc, type Issue } from "@flowmotion/core";
import { catalog } from "./catalog.ts";
import * as tools from "./tools.ts";

/** Text-in/text-out model seam: the real one is `anthropicModel`, tests pass a stub. */
export type Block = { type: "text"; text: string } | { type: "image"; png: Uint8Array };
export type Msg = { role: "user" | "assistant"; content: string | Block[] };
export type Model = (system: string, messages: Msg[]) => Promise<string>;

export type GenEvent =
  | { type: "progress"; stage: "examples" | "draft" | "repair" | "review"; message: string }
  | { type: "done"; doc: unknown; warnings: Issue[]; outline: string }
  | { type: "error"; message: string; issues?: unknown };

export const MAX_REPAIRS = 3;
export const MODEL = "claude-opus-5-5";

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);

/** The `n` templates whose title/summary share the most words with the prompt (as DSL: far smaller than JSON). */
export function closestTemplates(prompt: string, n = 2): { title: string; dsl: string }[] {
  const want = words(prompt);
  return catalog()
    .map(({ doc }) => {
      const have = words(`${doc.meta.title} ${doc.meta.summary ?? ""}`);
      return { doc, score: [...want].filter((w) => have.has(w)).length };
    })
    .sort((a, b) => b.score - a.score).slice(0, n)
    .map(({ doc }) => ({ title: doc.meta.title, dsl: printDsl(doc) })); // ponytail: keyword overlap; embeddings if retrieval quality matters
}

const issuesText = (issues: unknown) => JSON.stringify(issues, null, 2);
/** Strips a Markdown fence if the model wrapped its answer in one. */
const unfence = (s: string) => s.trim().replace(/^```[a-z]*\n([\s\S]*?)\n?```$/, "$1").trim();

const SYSTEM = (guide: string) =>
  `You author Flowmotion explainer animations.\n\n${guide}\n\nReply with ONLY the flow in the DSL (no commentary, no code fence).`;

/** Draft → validate → repair (≤ MAX_REPAIRS rounds, issues fed back verbatim) → optional visual self-check (≤ 1 op batch). */
export async function* generate(
  c: tools.Ctx,
  model: Model,
  { prompt }: { prompt: string },
): AsyncGenerator<GenEvent> {
  const system = SYSTEM(tools.guide());
  yield { type: "progress", stage: "examples", message: "Picking example flows" };
  const ex = closestTemplates(prompt);
  const msgs: Msg[] = [{ role: "user", content: `Example flows (style reference only):\n\n${ex.map((e) => `# ${e.title}\n${e.dsl}`).join("\n\n")}\n\n---\nWrite a flow for: ${prompt}` }];

  yield { type: "progress", stage: "draft", message: "Drafting" };
  let dsl = unfence(await model(system, msgs));
  for (let round = 0; ; round++) {
    const r = await tools.check({ dsl });
    if (r.ok) {
      let doc = tools.docOf({ dsl });
      let warnings = r.warnings as Issue[];
      if (c.renderer) {
        yield { type: "progress", stage: "review", message: "Reviewing the rendered layout" };
        const fixed = await selfCheck(c, model, system, doc, warnings).catch(() => undefined); // review is best-effort
        if (fixed) ({ doc, warnings } = fixed);
      }
      return void (yield { type: "done", doc, warnings, outline: outline(doc as FlowDoc) });
    }
    if (round === MAX_REPAIRS) return void (yield { type: "error", message: `Still invalid after ${MAX_REPAIRS} repair rounds.`, issues: r.errors });
    yield { type: "progress", stage: "repair", message: `Fixing ${(r.errors as unknown[]).length} issue(s), round ${round + 1}/${MAX_REPAIRS}` };
    msgs.push({ role: "assistant", content: dsl }, { role: "user", content: `Invalid. Fix every issue and reply with the complete corrected flow:\n${issuesText(r.errors)}` });
    dsl = unfence(await model(system, msgs));
  }
}

/** Looks at the contact sheets + lint once; applies at most one op batch, only if it still validates. */
async function selfCheck(c: tools.Ctx, model: Model, system: string, doc: unknown, warnings: Issue[]) {
  const { pngs } = await tools.preview(c, { doc });
  const reply = await model(system + "\nWhen asked to review, reply with ONLY a JSON array of edit ops (see 'Editing with ops'), or [] if the layout is fine.", [{
    role: "user",
    content: [...pngs.map((png) => ({ type: "image" as const, png })), { type: "text", text: `Contact sheets, one per scenario. Lint warnings:\n${issuesText(warnings)}\nFix only real layout/readability problems.` }],
  }]);
  const ops = JSON.parse(unfence(reply));
  if (!Array.isArray(ops) || !ops.length) return undefined;
  const r = tools.applyToDoc(doc, ops);
  return { doc: r.doc as unknown, warnings: (await tools.check({ doc: r.doc })).warnings as Issue[] };
}

/** Edit-with-AI: outline + selected entities → one op batch for the client to apply as a single undo entry. */
export async function editWithAI(
  model: Model,
  { doc, instruction, selectedIds = [] }: { doc: unknown; instruction: string; selectedIds?: string[] },
) {
  const v = tools.applyToDoc(doc, [{ op: "setMeta", value: {} }]).doc as FlowDoc; // validates doc (422 with issues)
  const d: any = v;
  const all = ["nodes", "edges", "groups", "arrays", "grids", "tokens", "code", "scenarios"].flatMap((k) => d[k] ?? []).concat(d.scenarios.flatMap((s: any) => s.steps));
  const sel = all.filter((e: any) => selectedIds.includes(e.id ?? `${e.from}-${e.to}`));
  const system = SYSTEM(tools.guide()).replace(/Reply with ONLY.*$/, "Reply with ONLY a JSON array of edit ops (see 'Editing with ops'), no commentary.");
  const msgs: Msg[] = [{ role: "user", content: `Outline:\n${outline(v)}\n\nSelected entities:\n${JSON.stringify(sel)}\n\nInstruction: ${instruction}` }];
  for (let round = 0; ; round++) {
    const reply = unfence(await model(system, msgs));
    let problem: unknown;
    try {
      const ops = JSON.parse(reply);
      const r = tools.applyToDoc(doc, ops);
      return { ops: ops as unknown[], outline: r.outline, warnings: r.warnings };
    } catch (e) {
      problem = e instanceof tools.ToolError ? e.body.issues ?? e.body : String((e as Error).message);
    }
    if (round === MAX_REPAIRS) throw new tools.ToolError(422, { error: "invalid", message: "The model did not produce valid ops.", issues: problem });
    msgs.push({ role: "assistant", content: reply }, { role: "user", content: `Invalid. Reply with the corrected JSON array:\n${issuesText(problem)}` });
  }
}

/** Real model: streamed (long outputs), adaptive thinking, server-side refusal fallback. */
export function anthropicModel(apiKey: string): Model {
  const client = new Anthropic({ apiKey });
  return async (system, messages) => {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 64_000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: messages.map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : m.content.map((b) => b.type === "text" ? b : { type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data: Buffer.from(b.png).toString("base64") } }),
      })),
    });
    const r = await stream.finalMessage();
    if (r.stop_reason === "refusal") throw new tools.ToolError(422, { error: "refused", message: "The model declined this request." });
    if (r.stop_reason === "max_tokens") throw new tools.ToolError(422, { error: "too_long", message: "The model's answer was cut off; try a smaller topic." });
    return r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  };
}
