import type { FlowDoc } from "./schema.ts";
import type { Issue } from "./validate.ts";
import type { Layout } from "./layout.ts";
import { flattenScenario } from "./timing.ts";
import { parseRef } from "./ref.ts";
import { wrap, measure, metrics, aspects } from "./runtime/index.ts";

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

  const primary = doc.nodes.filter((n) => n.tone === "primary").length;
  if (doc.nodes.length >= 3 && primary * 3 > doc.nodes.length)
    warn("tone_overuse", "/nodes", "nodes", `${primary} of ${doc.nodes.length} nodes are tone 'primary'; emphasis only works when it is rare.`, "Keep primary for the one or two nodes the viewer should look at.");

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

  // layout readability: overlapping edge labels, labels over nodes, diagram shrunk below readable size
  const boxes = doc.edges.flatMap((e, i) => {
    const l = lay.edges[i];
    if (!e.label || !l) return [];
    const w = measure(e.label, "inter", metrics.edgeLabelSize) + 8, h = metrics.edgeLabelSize + 6;
    return [{ id: l.id, path: `/edges/${i}/label`, r: { x: l.labelAt.x - w / 2, y: l.labelAt.y - h / 2, w, h } }];
  });
  const hit = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const hintFix = "Shorten or remove labels, merge parallel edges, drop edges that repeat what a 'send' action shows, or use `layout.edges: straight`.";
  boxes.forEach((a, i) => {
    const b = boxes.slice(i + 1).find((o) => hit(a.r, o.r));
    if (b) warn("edge_label_overlap", a.path, `edges › ${a.id}`, `Label of edge '${a.id}' overlaps the label of '${b.id}'; both are hard to read.`, hintFix);
    const n = lay.nodes.find((o) => hit(a.r, o.rect));
    if (n) warn("edge_label_over_node", a.path, `edges › ${a.id}`, `Label of edge '${a.id}' sits on node '${n.id}'.`, hintFix);
  });
  const frameW = 1280, frameH = frameW / aspects[doc.meta.aspect ?? "16:9"];
  const scale = Math.min(frameW / lay.bounds.w, frameH / lay.bounds.h);
  if (scale < 0.6) warn("diagram_too_small", "/nodes", "layout", `The diagram renders at ${Math.round(scale * 100)}% scale, so text is under ${Math.round(metrics.labelSize * scale)}px.`, "Use fewer nodes or edges, split into scenarios, or put detail in groups/arrays instead of nodes.");
  return out;
}
