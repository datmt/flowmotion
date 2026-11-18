import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode, ElkExtendedEdge } from "elkjs/lib/elk-api.js";
import type { FlowDoc } from "./schema.ts";
import { flattenScenario } from "./timing.ts";
import { maxLengths } from "./cells.ts";
import { kinds, measure, metrics, wrap } from "./runtime/index.ts";
import type { NodeKind } from "./schema.ts";

import type { Rect } from "./runtime/compiled.ts";
export type { Rect };
export interface Layout {
  bounds: Rect;
  groups: { id: string; label: string; rect: Rect }[];
  nodes: { id: string; kind: NodeKind; rect: Rect }[];
  edges: { id: string; from: string; to: string; arrow: boolean; dashed: boolean; points: number[]; length: number; labelAt: { x: number; y: number } }[];
  arrays: { id: string; label?: string; rect: Rect; orientation: "row" | "column"; keys?: string[]; slots: Rect[] }[];
  grids: { id: string; label?: string; rect: Rect; rows: number; cols: number; rowLabels?: string[]; colLabels?: string[]; slots: Rect[] }[];
  code: { id: string; title?: string; rect: Rect; lineCount: number }[];
}

const { cell, groupPad } = metrics;
const TITLE_H = 22; // label line above arrays/grids/code
const KEYS_H = 16; // index/key labels below array slots
const NODE_MAX_W = 200;


function nodeSize(label: string, kind: NodeKind) {
  const k = kinds[kind];
  const { lines } = wrap(label, NODE_MAX_W - 2 * metrics.nodePadX, "inter", metrics.labelSize, 2);
  const tw = Math.max(...lines.map((l) => measure(l, "inter", metrics.labelSize)));
  const diamond = k.shape === "diamond" ? 1.6 : 1; // text must fit inside the inscribed rectangle
  return {
    w: Math.ceil(Math.max(k.minW, (tw + 2 * metrics.nodePadX) * diamond)),
    h: Math.ceil(Math.max(k.minH, (lines.length * metrics.labelLineHeight + 2 * metrics.nodePadY) * diamond)),
  };
}

function arrayBox(n: number, orientation: "row" | "column", hasLabel: boolean) {
  const top = hasLabel ? TITLE_H : 0;
  const len = Math.max(n, 1);
  const along = (s: number) => len * s + (len - 1) * cell.gap;
  return orientation === "row"
    ? { w: along(cell.w), h: top + cell.h + KEYS_H, top }
    : { w: cell.w + 40, h: top + along(cell.h), top }; // column: key labels sit to the left (40px)
}

function polyLength(pts: number[]) {
  let l = 0;
  for (let i = 2; i < pts.length; i += 2) l += Math.hypot(pts[i]! - pts[i - 2]!, pts[i + 1]! - pts[i - 1]!);
  return l;
}
function pointAt(pts: number[], d: number) {
  for (let i = 2; i < pts.length; i += 2) {
    const seg = Math.hypot(pts[i]! - pts[i - 2]!, pts[i + 1]! - pts[i - 1]!);
    if (d <= seg || i === pts.length - 2) {
      const k = seg ? Math.min(d / seg, 1) : 0;
      return { x: pts[i - 2]! + (pts[i]! - pts[i - 2]!) * k, y: pts[i - 1]! + (pts[i + 1]! - pts[i - 1]!) * k };
    }
    d -= seg;
  }
  return { x: pts[0]!, y: pts[1]! };
}

/** 3-segment orthogonal route between two rects (used for edges touching pinned entities). */
function route(a: Rect, b: Rect): number[] {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  if (Math.abs(bc.x - ac.x) >= Math.abs(bc.y - ac.y)) {
    const ax = bc.x >= ac.x ? a.x + a.w : a.x, bx = bc.x >= ac.x ? b.x : b.x + b.w, mx = (ax + bx) / 2;
    return [ax, ac.y, mx, ac.y, mx, bc.y, bx, bc.y];
  }
  const ay = bc.y >= ac.y ? a.y + a.h : a.y, by = bc.y >= ac.y ? b.y : b.y + b.h, my = (ay + by) / 2;
  return [ac.x, ay, ac.x, my, bc.x, my, bc.x, by];
}

const union = (rs: Rect[]): Rect => {
  const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y));
  return { x: x0, y: y0, w: Math.max(...rs.map((r) => r.x + r.w)) - x0, h: Math.max(...rs.map((r) => r.y + r.h)) - y0 };
};

/** Deterministic auto-layout (ELK). Hidden entities are laid out too, so reveals never reflow. Assumes a validated doc. */
export async function layout(doc: FlowDoc): Promise<Layout> {
  const algorithm = doc.layout?.algorithm ?? "layered";
  const dir = (doc.layout?.direction ?? "LR") === "LR" ? "RIGHT" : "DOWN";
  const lens = maxLengths(doc, (id) => flattenScenario(doc, id));

  // — leaf sizes —
  type Leaf = { id: string; w: number; h: number; group?: string; pos?: { x: number; y: number } };
  const leaves: Leaf[] = [];
  const sizes = new Map<string, { w: number; h: number }>();
  const put = (l: Leaf) => (leaves.push(l), sizes.set(l.id, l));
  doc.nodes.forEach((n) => put({ id: n.id, ...nodeSize(n.label, n.kind), group: n.group, pos: n.pos }));
  doc.arrays?.forEach((a) => put({ id: a.id, ...arrayBox(lens.get(a.id) ?? a.values.length, a.orientation ?? "row", !!a.label), group: a.group, pos: a.pos }));
  doc.grids?.forEach((g) => {
    const cols = g.rows[0]!.length, rows = g.rows.length;
    const lw = g.rowLabels ? 40 : 0, lh = g.colLabels ? 20 : 0, top = g.label ? TITLE_H : 0;
    put({ id: g.id, w: lw + cols * cell.w + (cols - 1) * cell.gap, h: top + lh + rows * cell.h + (rows - 1) * cell.gap, group: g.group, pos: g.pos });
  });
  doc.code?.forEach((c) => {
    const lines = c.code.split("\n");
    const tw = Math.max(...lines.map((l) => measure(l, "mono", metrics.codeSize)));
    put({ id: c.id, w: Math.ceil(Math.min(Math.max(tw + 2 * metrics.codePad + 28, 160), 640)), h: (c.title ? TITLE_H : 0) + lines.length * metrics.codeLineHeight + 2 * metrics.codePad });
  });

  // — ELK graph —
  const compound = algorithm === "layered" && !!doc.groups?.length;
  const leafElk = (l: Leaf): ElkNode => ({ id: l.id, width: l.w, height: l.h });
  const children: ElkNode[] = compound
    ? [
        ...doc.groups!.map((g): ElkNode => ({
          id: g.id,
          children: leaves.filter((l) => l.group === g.id).map(leafElk),
          layoutOptions: { "elk.padding": `[top=${groupPad + 16},left=${groupPad},bottom=${groupPad},right=${groupPad}]` },
        })).filter((g) => g.children!.length),
        ...leaves.filter((l) => !l.group).map(leafElk),
      ]
    : leaves.map(leafElk);
  const elkEdges: ElkExtendedEdge[] = doc.edges.map((e) => ({ id: e.id ?? `${e.from}-${e.to}`, sources: [e.from], targets: [e.to] }));
  const root: ElkNode = {
    id: "root",
    children,
    edges: elkEdges,
    layoutOptions: {
      "elk.algorithm": { layered: "layered", tree: "mrtree", stress: "stress" }[algorithm],
      "elk.direction": dir,
      "elk.json.shapeCoords": "ROOT",
      "elk.json.edgeCoords": "ROOT",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.randomSeed": "1",
      "elk.spacing.nodeNode": "40",
      "elk.spacing.componentComponent": "48",
      "elk.layered.spacing.nodeNodeBetweenLayers": "64",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.stress.desiredEdgeLength": "160",
    },
  };
  const out = await new ELK().layout(root);

  // — collect rects (absolute coords) —
  const rect = new Map<string, Rect>();
  const walk = (n: ElkNode) => n.children?.forEach((c) => { rect.set(c.id, { x: c.x!, y: c.y!, w: c.width!, h: c.height! }); walk(c); });
  walk(out);
  const pinned = new Set<string>();
  for (const l of leaves) if (l.pos) { rect.set(l.id, { x: l.pos.x, y: l.pos.y, w: l.w, h: l.h }); pinned.add(l.id); }

  // groups: ELK compound rect, or bbox of children (flat algorithms / pinned members)
  const groupRect = (id: string): Rect | undefined => {
    const kids = leaves.filter((l) => l.group === id).map((l) => rect.get(l.id)!);
    if (!kids.length) return undefined;
    const needsBox = !compound || leaves.some((l) => l.group === id && pinned.has(l.id));
    if (!needsBox && rect.has(id)) return rect.get(id);
    const u = union(kids);
    return { x: u.x - groupPad, y: u.y - groupPad - 16, w: u.w + 2 * groupPad, h: u.h + 2 * groupPad + 16 };
  };
  const groups = (doc.groups ?? []).flatMap((g) => { const r = groupRect(g.id); return r ? [{ id: g.id, label: g.label, rect: r }] : []; });

  // — edges —
  const edges = doc.edges.map((e) => {
    const id = e.id ?? `${e.from}-${e.to}`;
    const sec = out.edges?.find((x) => x.id === id)?.sections?.[0];
    let points = sec ? [sec.startPoint.x, sec.startPoint.y, ...(sec.bendPoints ?? []).flatMap((b) => [b.x, b.y]), sec.endPoint.x, sec.endPoint.y] : [];
    if (!points.length || pinned.has(e.from) || pinned.has(e.to)) points = route(rect.get(e.from)!, rect.get(e.to)!);
    const length = polyLength(points);
    return { id, from: e.from, to: e.to, arrow: e.arrow ?? true, dashed: e.dashed ?? false, points, length, labelAt: pointAt(points, length / 2) };
  });

  // — normalise so bounds start at (24,24) —
  const all = [...rect.values(), ...groups.map((g) => g.rect), ...edges.map((e) => ({ x: Math.min(...e.points.filter((_, i) => i % 2 === 0)), y: Math.min(...e.points.filter((_, i) => i % 2)), w: 0, h: 0 }))];
  const u = union(all);
  const M = 24, dx = M - u.x, dy = M - u.y;
  const sh = (r: Rect): Rect => ({ x: r.x + dx, y: r.y + dy, w: r.w, h: r.h });
  const R = (id: string) => sh(rect.get(id)!);
  for (const e of edges) {
    e.points = e.points.map((v, i) => v + (i % 2 ? dy : dx));
    e.labelAt = { x: e.labelAt.x + dx, y: e.labelAt.y + dy };
  }

  const arrays = (doc.arrays ?? []).map((a) => {
    const r = R(a.id), n = Math.max(lens.get(a.id) ?? a.values.length, 1), col = (a.orientation ?? "row") === "column";
    const top = a.label ? TITLE_H : 0;
    const slots = Array.from({ length: n }, (_, i) => col
      ? { x: r.x + r.w - cell.w, y: r.y + top + i * (cell.h + cell.gap), w: cell.w, h: cell.h }
      : { x: r.x + i * (cell.w + cell.gap), y: r.y + top, w: cell.w, h: cell.h });
    return { id: a.id, ...(a.label ? { label: a.label } : {}), rect: r, orientation: col ? "column" as const : "row" as const, ...(a.keys ? { keys: a.keys } : {}), slots };
  });
  const grids = (doc.grids ?? []).map((g) => {
    const r = R(g.id), cols = g.rows[0]!.length, rows = g.rows.length;
    const x0 = r.x + (g.rowLabels ? 40 : 0), y0 = r.y + (g.label ? TITLE_H : 0) + (g.colLabels ? 20 : 0);
    const slots = g.rows.flatMap((row, i) => row.map((_, j) => ({ x: x0 + j * (cell.w + cell.gap), y: y0 + i * (cell.h + cell.gap), w: cell.w, h: cell.h })));
    return { id: g.id, ...(g.label ? { label: g.label } : {}), rect: r, rows, cols, ...(g.rowLabels ? { rowLabels: g.rowLabels } : {}), ...(g.colLabels ? { colLabels: g.colLabels } : {}), slots };
  });
  const g2 = groups.map((g) => ({ ...g, rect: sh(g.rect) }));
  const bounds = union([...[...rect.keys()].map(R), ...g2.map((g) => g.rect)]);
  return {
    bounds: { x: 0, y: 0, w: bounds.x + bounds.w + M, h: bounds.y + bounds.h + M },
    groups: g2,
    nodes: doc.nodes.map((n) => ({ id: n.id, kind: n.kind, rect: R(n.id) })),
    edges, arrays, grids,
    code: (doc.code ?? []).map((c) => ({ id: c.id, ...(c.title ? { title: c.title } : {}), rect: R(c.id), lineCount: c.code.split("\n").length })),
  };
}
