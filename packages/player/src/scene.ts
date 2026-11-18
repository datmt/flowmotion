import Konva from "konva";
import { measure, wrap, themes, kinds, metrics, sample } from "@flowmotion/core/runtime";
import type { CompiledFlow, FrameState, EntFrame, Rect, StateName, Theme } from "@flowmotion/core/runtime";

const SANS = metrics.fonts.ui, MONO = metrics.fonts.mono;

// — colour mixing —
const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a: string, b: string, k: number) => "#" + hex(a).map((v, i) => Math.round(v + (hex(b)[i]! - v) * k).toString(16).padStart(2, "0")).join("");

const text = (o: Konva.TextConfig) => new Konva.Text({ fontFamily: SANS, fontSize: metrics.labelSize, listening: false, ...o });

interface Part { group: Konva.Group; update(f: EntFrame, th: Theme, dim: number): void }

/** Builds the Konva scene once for (compiled, scenario); update(frame) only sets attrs (no allocation per frame beyond pooled shapes). */
export function buildScene(c: CompiledFlow, scenarioId: string, stage: Konva.Stage) {
  const sc = c.scenarios.find((s) => s.id === scenarioId)!;
  const th = themes[c.meta.theme];
  const layer = new Konva.Layer({ listening: false });
  stage.add(layer);
  const world = new Konva.Group();
  layer.add(world);
  const parts = new Map<string, Part>();
  const pulseTargets = new Map<string, Konva.Group>();
  const statePaint = (f: EntFrame) => {
    const a = th.state[f.fromState as StateName], b = th.state[f.state as StateName];
    return { fill: mix(a.fill, b.fill, f.stateK), stroke: mix(a.stroke, b.stroke, f.stateK), text: mix(a.text, b.text, f.stateK) };
  };
  const labelPair = (g: Konva.Group, o: Konva.TextConfig) => {
    const cur = text(o), old = text(o);
    g.add(old, cur);
    return (f: EntFrame, color: string, wrapW?: number) => {
      const fit = (s: string | undefined) => (wrapW ? wrap(s ?? "", wrapW, "inter", o.fontSize ?? metrics.labelSize, 2).lines.join("\n") : s ?? "");
      cur.text(fit(f.label)); cur.fill(color); cur.opacity(f.labelK ?? 1);
      const x = f.fromLabel !== undefined && (f.labelK ?? 1) < 1 && f.fromLabel !== f.label;
      old.text(fit(f.fromLabel)); old.fill(color); old.opacity(x ? 1 - (f.labelK ?? 1) : 0);
    };
  };
  const add = (id: string, g: Konva.Group, update: Part["update"]) => { world.add(g); parts.set(id, { group: g, update }); };

  // groups
  for (const g of c.groups) {
    const gr = new Konva.Group({ x: g.rect.x, y: g.rect.y }), r = new Konva.Rect({ width: g.rect.w, height: g.rect.h, cornerRadius: 12, strokeWidth: 1, dash: [6, 4] });
    gr.add(r);
    const lab = labelPair(gr, { x: 12, y: 10, fontSize: 12, fontStyle: "bold", width: g.rect.w - 24 });
    add(g.id, gr, (f, t, dim) => { r.fill(t.group.fill); r.stroke(t.group.stroke); lab(f, t.group.label); gr.opacity(f.opacity * dim); });
  }
  // sequence lifelines (under edges)
  for (const l of c.lifelines ?? []) {
    world.add(new Konva.Line({ points: [l.x, l.y0, l.x, l.y1], strokeWidth: 1.5, dash: [6, 6], stroke: th.edge, opacity: 0.5 }));
  }
  // edges (under nodes)
  for (const e of c.edges) {
    const gr = new Konva.Group(), a = new Konva.Arrow({ points: e.points, strokeWidth: 2, pointerLength: e.arrow ? 9 : 0, pointerWidth: e.arrow ? 9 : 0, dash: e.dashed ? [8, 5] : undefined, lineJoin: "round" });
    const bg = new Konva.Rect({ cornerRadius: 4 });
    gr.add(a, bg);
    const lab = labelPair(gr, { x: e.labelAt.x, y: e.labelAt.y, fontSize: metrics.edgeLabelSize });
    add(e.id, gr, (f, t, dim) => {
      const p = statePaint(f), col = f.state === "idle" && f.fromState === "idle" ? t.edge : p.stroke;
      a.stroke(col); a.fill(col);
      lab(f, t.muted);
      const l = gr.getChildren((n) => n instanceof Konva.Text)[1] as Konva.Text;
      l.offsetX(l.width() / 2); l.offsetY(l.height() / 2);
      bg.setAttrs({ x: l.x() - l.width() / 2 - 3, y: l.y() - l.height() / 2 - 1, width: l.width() + 6, height: l.height() + 2, fill: l.text() ? t.bg : "transparent" });
      gr.opacity(f.opacity * dim);
    });
  }
  // nodes
  for (const n of c.nodes) {
    const { w, h } = n.rect, shape = kinds[n.kind].shape;
    const gr = new Konva.Group({ x: n.rect.x, y: n.rect.y });
    const fills: Konva.Shape[] = [];
    const sk = { strokeWidth: 2 };
    if (shape === "diamond") fills.push(new Konva.Line({ points: [w / 2, 0, w, h / 2, w / 2, h, 0, h / 2], closed: true, ...sk }));
    else if (shape === "circle") fills.push(new Konva.Ellipse({ x: w / 2, y: h / 2, radiusX: w / 2, radiusY: h / 2, ...sk }));
    else if (shape === "cylinder") fills.push(new Konva.Path({ data: `M0 10 A${w / 2} 10 0 0 1 ${w} 10 V${h - 10} A${w / 2} 10 0 0 1 0 ${h - 10} Z`, ...sk }), new Konva.Path({ data: `M0 10 A${w / 2} 10 0 0 0 ${w} 10`, fillEnabled: false, ...sk }));
    else fills.push(new Konva.Rect({ width: w, height: h, cornerRadius: shape === "pill" ? h / 2 : 10, dash: shape === "dashed" ? [7, 4] : undefined, ...sk }));
    const extra = shape === "queue" ? [w / 3, (2 * w) / 3].map((x) => new Konva.Line({ points: [x, 0, x, h], strokeWidth: 1.5 })) : [];
    gr.add(...fills, ...extra);
    if (shape === "actor") gr.add(new Konva.Circle({ x: w / 2, y: 16, radius: 8, strokeWidth: 2, name: "head" }));
    const lab = labelPair(gr, { x: 8, y: shape === "actor" ? 30 : 0, width: w - 16, height: shape === "actor" ? h - 30 : h, align: "center", verticalAlign: "middle" });
    gr.offset({ x: -0, y: 0 });
    add(n.id, gr, (f, t, dim) => {
      const p = statePaint(f);
      fills.forEach((s) => { s.stroke(p.stroke); if (s.fillEnabled()) s.fill(p.fill); });
      extra.forEach((s) => s.stroke(p.stroke));
      gr.findOne(".head")?.setAttrs({ stroke: p.stroke, fill: p.fill });
      lab(f, p.text, w - 16);
      gr.opacity(f.opacity * dim);
    });
    pulseTargets.set(n.id, gr);
  }
  // arrays & grids
  const cellPart = (cid: string, owner: string, w: number, h: number) => {
    const gr = new Konva.Group({ offsetX: w / 2, offsetY: h / 2 }), r = new Konva.Rect({ width: w, height: h, cornerRadius: 6, strokeWidth: 2 });
    gr.add(r);
    const lab = labelPair(gr, { width: w, height: h, align: "center", verticalAlign: "middle", fontFamily: MONO, fontSize: 15 });
    add(cid, gr, (f, t, dim) => {
      const p = statePaint(f), o = parts.get(owner)!.group.opacity();
      r.fill(f.state === "idle" && f.fromState === "idle" ? t.cell.fill : p.fill); r.stroke(f.state === "idle" && f.fromState === "idle" ? t.cell.stroke : p.stroke);
      lab(f, p.text === t.state.idle.text ? t.cell.text : p.text);
      gr.opacity(f.opacity * o); void dim;
    });
    pulseTargets.set(cid, gr);
  };
  const owner = (o: { id: string; label?: string; rect: Rect }, deco: (gr: Konva.Group) => void) => {
    const gr = new Konva.Group({ x: o.rect.x, y: o.rect.y });
    if (o.label) gr.add(text({ text: o.label, fontSize: 12, fontStyle: "bold", name: "title" }));
    deco(gr);
    add(o.id, gr, (f, t, dim) => { gr.opacity(f.opacity * dim); gr.find(".title").forEach((x) => (x as Konva.Text).fill(t.muted)); gr.find(".deco").forEach((x) => (x as Konva.Text).fill(t.cell.key)); });
  };
  for (const a of c.arrays) owner(a, (gr) => a.slots.forEach((s, i) => {
    const col = a.orientation === "column";
    gr.add(text({ text: a.keys?.[i] ?? String(i), name: "deco", fontSize: 11, x: col ? s.x - a.rect.x - 36 : s.x - a.rect.x, y: col ? s.y - a.rect.y + s.h / 2 - 6 : s.y - a.rect.y + s.h + 2, width: col ? 32 : s.w, align: col ? "right" : "center" }));
  }));
  for (const g of c.grids) owner(g, (gr) => {
    g.colLabels?.forEach((l, j) => { const s = g.slots[j]!; gr.add(text({ text: l, name: "deco", fontSize: 11, x: s.x - g.rect.x, y: s.y - g.rect.y - 16, width: s.w, align: "center" })); });
    g.rowLabels?.forEach((l, i) => { const s = g.slots[i * g.cols]!; gr.add(text({ text: l, name: "deco", fontSize: 11, x: s.x - g.rect.x - 40, y: s.y - g.rect.y + s.h / 2 - 6, width: 34, align: "right" })); });
  });
  for (const cell of sc.cells) {
    const o = c.arrays.find((a) => a.id === cell.owner) ?? c.grids.find((g) => g.id === cell.owner)!;
    cellPart(cell.id, cell.owner, o.slots[0]!.w, o.slots[0]!.h);
  }
  // code
  for (const cb of c.code) {
    const gr = new Konva.Group({ x: cb.rect.x, y: cb.rect.y }), r = new Konva.Rect({ width: cb.rect.w, height: cb.rect.h, cornerRadius: 8, strokeWidth: 1 });
    gr.add(r);
    const top = (cb.title ? 22 : 0) + metrics.codePad;
    if (cb.title) gr.add(text({ text: cb.title, x: metrics.codePad, y: 6, fontSize: 11, fontStyle: "bold", name: "title" }));
    const hl = cb.lines.map((_, i) => new Konva.Rect({ x: 4, y: top + i * metrics.codeLineHeight, width: cb.rect.w - 8, height: metrics.codeLineHeight, cornerRadius: 3, visible: false }));
    gr.add(...hl);
    cb.lines.forEach((toks, i) => {
      let x = metrics.codePad + 20;
      gr.add(text({ text: String(i + 1), x: metrics.codePad - 4, y: top + i * metrics.codeLineHeight + 3, fontFamily: MONO, fontSize: metrics.codeSize - 2, name: "gutter", width: 20, align: "right" }));
      for (const t of toks) {
        gr.add(text({ text: t.text, x, y: top + i * metrics.codeLineHeight + 3, fontFamily: MONO, fontSize: metrics.codeSize, fill: t.color || undefined, name: "tok" }));
        x += measure(t.text, "mono", metrics.codeSize);
      }
    });
    add(cb.id, gr, (f, t, dim) => {
      r.fill(t.code.bg); r.stroke(t.group.stroke);
      gr.find(".title").forEach((x) => (x as Konva.Text).fill(t.muted)); gr.find(".gutter").forEach((x) => (x as Konva.Text).fill(t.code.gutter));
      const on = new Set<number>();
      for (const part of (parts.get(cb.id) as Part & { spec?: string }).spec?.split(",") ?? []) { if (!part) continue; const [a, b] = part.split("-").map(Number) as [number, number?]; for (let n = a!; n <= (b ?? a!); n++) on.add(n); }
      hl.forEach((h, i) => { h.visible(on.has(i + 1)); h.fill(t.code.highlight); });
      gr.opacity(f.opacity * dim);
    });
  }
  // tokens, packets, callouts (pooled)
  const tokenParts = c.tokens.map((tk) => {
    const gr = new Konva.Group(), dot = new Konva.Circle({ radius: 6, strokeWidth: 2 }), tri = new Konva.Line({ points: [-6, -11, 6, -11, 0, -2], closed: true });
    gr.add(tri, dot);
    const lab = text({ fontSize: 11, fontStyle: "bold" });
    gr.add(lab);
    world.add(gr);
    return { id: tk.id, gr, dot, tri, lab };
  });
  const pool = <T extends Konva.Node>(make: () => T) => { const items: T[] = []; return (n: number) => { while (items.length < n) items.push(make()); items.forEach((x, i) => x.visible(i < n)); return items; }; };
  const packetPool = pool(() => { const g = new Konva.Group(); g.add(new Konva.Circle({ radius: 7 }), text({ fontSize: 11, y: -22, align: "center", width: 100, offsetX: 50 })); world.add(g); return g; });
  const calloutPool = pool(() => { const g = new Konva.Group(); g.add(new Konva.Rect({ cornerRadius: 6 }), text({ fontSize: 12, padding: 6, width: 180, align: "left" })); world.add(g); return g; });

  const rectAt = (x: number, y: number): Rect | undefined => [...c.nodes.map((n) => n.rect), ...[...c.arrays, ...c.grids].flatMap((o) => o.slots)].find((r) => x >= r.x - 1 && x <= r.x + r.w + 1 && y >= r.y - 1 && y <= r.y + r.h + 1);
  const targetRect = (id: string): Rect | undefined => { const g = parts.get(id)?.group; return g ? { x: g.x() - g.offsetX(), y: g.y() - g.offsetY(), w: g.width() || (c.nodes.find((n) => n.id === id)?.rect.w ?? 0), h: g.height() || (c.nodes.find((n) => n.id === id)?.rect.h ?? 0) } : undefined; };

  function update(fr: FrameState) {
    const dimOf = (id: string) => (fr.camera.dim.has(id) ? 1 - 0.7 * fr.camera.dimK : 1);
    for (const [id, p] of parts) {
      const f = fr.ents.get(id);
      if (!f) continue;
      if (f.x !== undefined && id.includes("@")) p.group.position({ x: f.x, y: f.y! });
      const cp = p as Part & { spec?: string }; cp.spec = fr.lines.get(id);
      p.update(f, th, dimOf(id.includes("@") ? id.slice(0, id.indexOf("@")) : id));
    }
    const pulse = new Map(fr.pulses.map((p) => [p.target, p.k]));
    for (const [id, g] of pulseTargets) {
      const k = pulse.get(id) ?? 0, cx = id.includes("@") ? 0 : (g.width() || 0) / 2;
      g.scale({ x: 1 + 0.1 * k, y: 1 + 0.1 * k });
      if (!id.includes("@")) { const n = c.nodes.find((x) => x.id === id)!; g.offset({ x: n.rect.w / 2, y: n.rect.h / 2 }); g.position({ x: n.rect.x + n.rect.w / 2, y: n.rect.y + n.rect.h / 2 }); }
      void cx;
    }
    for (const t of tokenParts) {
      const f = fr.ents.get(t.id)!, lbl = c.tokens.find((x) => x.id === t.id)?.label ?? "";
      const r = f.x === undefined ? undefined : rectAt(f.x, f.y!);
      t.gr.visible(f.x !== undefined); t.gr.opacity(f.opacity);
      if (f.x === undefined) continue;
      t.gr.position({ x: f.x, y: r ? r.y : f.y! });
      t.dot.setAttrs({ fill: th.token, stroke: th.bg, y: -16 }); t.tri.fill(th.token);
      t.lab.setAttrs({ text: lbl, fill: th.token, y: -38 }); t.lab.offsetX(t.lab.width() / 2);
    }
    packetPool(fr.packets.length).forEach((g, i) => {
      const p = fr.packets[i]; if (!p) return;
      g.position(p); g.opacity(p.opacity);
      (g.children[0] as Konva.Circle).fill(th.packet); (g.children[1] as Konva.Text).setAttrs({ text: p.label ?? "", fill: th.text });
    });
    calloutPool(fr.callouts.length).forEach((g, i) => {
      const k = fr.callouts[i]; if (!k) return;
      const r = (k.target.includes("@") ? fr.ents.get(k.target) && { x: fr.ents.get(k.target)!.x! - 28, y: fr.ents.get(k.target)!.y! - 22, w: 56, h: 44 } : targetRect(k.target)) ?? { x: 0, y: 0, w: 0, h: 0 };
      const t = g.children[1] as Konva.Text, bg = g.children[0] as Konva.Rect;
      t.setAttrs({ text: k.text, fill: th.callout.text }); bg.setAttrs({ width: t.width(), height: t.height(), fill: th.callout.fill, stroke: th.callout.text, strokeWidth: 1 });
      g.position({ x: r.x + r.w / 2 - t.width() / 2, y: r.y - t.height() - 14 }); g.opacity(k.opacity);
    });
    // camera
    const s = Math.min(stage.width() / fr.camera.rect.w, stage.height() / fr.camera.rect.h);
    world.scale({ x: s, y: s });
    world.position({ x: (stage.width() - fr.camera.rect.w * s) / 2 - fr.camera.rect.x * s, y: (stage.height() - fr.camera.rect.h * s) / 2 - fr.camera.rect.y * s });
    stage.container().style.background = th.bg;
    layer.draw();
  }
  void sample;
  return { update, world, destroy: () => layer.destroy() };
}
