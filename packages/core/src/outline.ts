import type { FlowDoc } from "./schema.ts";
import { scheduleScenario } from "./timing.ts";

const MAX = 40;
const list = (xs: string[]) => (xs.length > MAX ? [...xs.slice(0, MAX), `… +${xs.length - MAX}`] : xs).join("; ");

/** Compact text view of a doc (PLAN §1.6). Doc must be valid. */
export function outline(doc: FlowDoc, rev?: number): string {
  const n = (k: string, c: number) => `${c} ${k}`;
  const out = [
    `${doc.meta.title}  (${[rev !== undefined ? `rev ${rev}` : "", n("nodes", doc.nodes.length), n("edges", doc.edges.length), n("scenarios", doc.scenarios.length)].filter(Boolean).join(", ")})`,
  ];
  const line = (k: string, xs: string[]) => xs.length && out.push(`${k}: ${list(xs)}`);
  line("groups", (doc.groups ?? []).map((g) => `${g.id} "${g.label}"`));
  line("nodes", doc.nodes.map((x) => `${x.id}[${x.kind}${x.group ? "@" + x.group : ""}] "${x.label}"`));
  line("edges", doc.edges.map((e) => e.id ?? `${e.from}-${e.to}`));
  line("arrays", (doc.arrays ?? []).map((a) => (a.keys ? `${a.id}{${a.keys.join(",")}}` : `${a.id}[${a.values.length}]`)));
  line("grids", (doc.grids ?? []).map((g) => `${g.id}[${g.rows.length}x${g.rows[0]?.length ?? 0}]`));
  line("tokens", (doc.tokens ?? []).map((t) => `${t.id}@${t.at}`));
  line("code", (doc.code ?? []).map((c) => `${c.id}[${c.language}]`));
  for (const s of doc.scenarios) {
    const b = s.branchFrom ? ` ⑂ ${s.branchFrom.scenario}@${s.branchFrom.afterStep}` : "";
    out.push(`scenario ${s.id} "${s.title}"${b} (${scheduleScenario(doc, s.id).duration.toFixed(1)}s)`);
    out.push("  " + s.steps.map((t) => `${t.id} "${t.title}" (${t.actions.length})`).join(" · "));
  }
  return out.join("\n");
}
