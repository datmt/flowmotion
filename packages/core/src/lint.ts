import type { FlowDoc } from "./schema.ts";
import type { Issue } from "./validate.ts";
import type { Layout } from "./layout.ts";
import { flattenScenario } from "./timing.ts";
import { parseRef } from "./ref.ts";
import { wrap, metrics } from "./runtime/index.ts";

/** Explainer-quality warnings (PRD §5.6). Never blocks. Assumes a validated doc. */
export function lint(doc: FlowDoc, lay: Layout): Issue[] {
  const out: Issue[] = [];
  const warn = (code: string, path: string, where: string, message: string, hint?: string) =>
    out.push({ severity: "warning", code, path, where, message, ...(hint ? { hint } : {}) });

  // references: every entity id that appears anywhere
  const used = new Set<string>();
  doc.edges.forEach((e) => (used.add(e.from), used.add(e.to)));
  [...(doc.nodes), ...(doc.arrays ?? []), ...(doc.grids ?? [])].forEach((e) => e.group && used.add(e.group));
  doc.tokens?.forEach((t) => used.add(parseRef(t.at)!.entity));
  const shown = new Set<string>();
  for (const s of doc.scenarios) for (const st of s.steps) for (const a of st.actions) {
    const refs: string[] = [];
    if ("targets" in a) refs.push(...a.targets);
    if ("target" in a) refs.push(a.target);
    if (a.do === "send") refs.push(a.from, a.to, ...(a.via ? [a.via] : []), ...(a.token ? [a.token] : []));
    if (a.do === "move") refs.push(a.to, a.token);
    if (a.do === "swap") refs.push(a.a, a.b);
    for (const r of refs) { const id = parseRef(r)!.entity; used.add(id); if (a.do === "show") shown.add(id); }
  }
  const decl = (kind: string, list: { id: string; hidden?: boolean }[] | undefined, key: string) =>
    list?.forEach((e, i) => {
      if (kind !== "edge" && !used.has(e.id))
        warn("unreferenced", `/${key}/${i}`, `${key} › ${e.id}`, `${kind} '${e.id}' is declared but never referenced.`, "Connect it, use it in an action, or remove it.");
      if (e.hidden && !shown.has(e.id)) warn("never_visible", `/${key}/${i}/hidden`, `${key} › ${e.id}`, `${kind} '${e.id}' is hidden and never shown.`, "Add a 'show' action or drop 'hidden'.");
    });
  decl("node", doc.nodes, "nodes"); decl("array", doc.arrays, "arrays"); decl("grid", doc.grids, "grids"); decl("code block", doc.code, "code"); decl("group", doc.groups, "groups");
  doc.edges.forEach((e, i) => e.hidden && !shown.has(e.id ?? `${e.from}-${e.to}`) && warn("never_visible", `/edges/${i}/hidden`, `edges › ${e.id ?? `${e.from}-${e.to}`}`, `Edge '${e.id ?? `${e.from}-${e.to}`}' is hidden and never shown.`));

  doc.nodes.forEach((n, i) => {
    if (wrap(n.label, 200 - 2 * metrics.nodePadX, "inter", metrics.labelSize, 2).overflow)
      warn("label_wraps", `/nodes/${i}/label`, `nodes › ${n.id}`, `Label of '${n.id}' wraps past 2 lines.`, "Shorten it.");
  });

  doc.scenarios.forEach((s, si) => {
    s.steps.forEach((st, j) => {
      const at = `/scenarios/${si}/steps/${j}`, w = `${s.id} › ${st.id}`;
      if (!st.actions.length && st.narration.length < 40) warn("empty_step", at, w, "Step has no actions and very short narration.", "Add an action or expand the narration.");
      if (st.narration.length > 280) warn("long_narration", `${at}/narration`, w, `Narration is ${st.narration.length} chars; it will be cut off in video captions.`, "Keep it under 280.");
      const reveals = st.actions.reduce((n, a) => n + (a.do === "show" ? a.targets.length : 0), 0);
      if (reveals > 7) warn("too_many_reveals", at, w, `${reveals} entities revealed in one step.`, "Break the reveal into several steps.");
    });
    // visible-node count over time
    const vis = new Set(doc.nodes.filter((n) => !n.hidden).map((n) => n.id));
    let peak = vis.size, focus = false;
    for (const f of flattenScenario(doc, s.id)) for (const a of f.step.actions) {
      if (a.do === "focus") focus = true;
      if (a.do === "show" || a.do === "hide") for (const t of a.targets) a.do === "show" ? vis.add(t) : vis.delete(t);
      peak = Math.max(peak, [...vis].filter((id) => doc.nodes.some((n) => n.id === id)).length);
    }
    if (peak > 15 && !focus) warn("no_focus_large", `/scenarios/${si}`, s.id, `${peak} nodes are visible at once and the scenario never uses 'focus'.`, "Add 'focus' actions to guide the eye.");
  });

  const pinned = doc.nodes.filter((n) => n.pos);
  const rect = (id: string) => lay.nodes.find((n) => n.id === id)!.rect;
  for (const p of pinned) {
    const a = rect(p.id);
    const hit = lay.nodes.find((o) => o.id !== p.id && a.x < o.rect.x + o.rect.w && o.rect.x < a.x + a.w && a.y < o.rect.y + o.rect.h && o.rect.y < a.y + a.h);
    if (hit) warn("pin_overlap", `/nodes/${doc.nodes.indexOf(p)}/pos`, `nodes › ${p.id}`, `Pinned node '${p.id}' overlaps '${hit.id}'.`);
  }
  return out;
}
