// Interactive layer drawn over the player's scene: hit boxes for select + drag-to-pin, edge hit lines,
// and a connect handle on the selected node. The player scene itself stays non-interactive.
// ponytail: edges re-route after drop (recompile), not live while dragging; live = port core's pin router.
import Konva from "konva";
import type { Player } from "@flowmotion/player";
import type { CompiledFlow, Rect } from "@flowmotion/core/runtime";

export interface Handlers { select(id?: string): void; move(id: string, x: number, y: number): void; connect(from: string, to: string): void }
const BLUE = "#2563eb", HOVER = "#93c5fd", GHOST = "#94a3b8", CLEAR = "rgba(0,0,0,0.01)";

export function createOverlay(p: Player, c: CompiledFlow, hidden: ReadonlySet<string>, h: Handlers) {
  const layer = new Konva.Layer(), root = new Konva.Group();
  layer.add(root);
  p.stage.add(layer);
  const items = new Map<string, Konva.Shape>(), kinds = new Map<string, "edge" | "box">();
  let sel: string | undefined, hover: string | undefined, handle: Konva.Circle | undefined;

  const style = (id: string) => {
    const s = items.get(id)!, on = id === sel, edge = kinds.get(id) === "edge";
    const col = on ? BLUE : id === hover ? HOVER : hidden.has(id) ? GHOST : undefined;
    s.setAttrs(edge ? { stroke: col ?? CLEAR, strokeWidth: on ? 4 : 3 } : { stroke: col, dash: !on && hidden.has(id) ? [4, 4] : undefined, strokeWidth: 2 });
  };
  const hit = (x: number, y: number) => c.nodes.find((n) => x >= n.rect.x && x <= n.rect.x + n.rect.w && y >= n.rect.y && y <= n.rect.y + n.rect.h)?.id;
  const bind = (id: string, s: Konva.Shape) => {
    items.set(id, s);
    s.on("mouseenter", () => { hover = id; style(id); p.stage.container().style.cursor = s.draggable() ? "move" : "pointer"; layer.batchDraw(); });
    s.on("mouseleave", () => { hover = undefined; style(id); p.stage.container().style.cursor = "grab"; layer.batchDraw(); });
    s.on("click tap", (e) => { e.cancelBubble = true; h.select(id); });
    s.on("dragstart", () => { p.pause(); h.select(id); s.fill("rgba(37,99,235,0.12)"); });
    s.on("dragend", (e) => { e.cancelBubble = true; s.fill(CLEAR); h.move(id, Math.round(s.x()), Math.round(s.y())); });
    root.add(s);
  };
  const box = (id: string, r: Rect, draggable: boolean) => {
    kinds.set(id, "box");
    bind(id, new Konva.Rect({ x: r.x, y: r.y, width: r.w, height: r.h, cornerRadius: 8, fill: CLEAR, draggable, strokeScaleEnabled: false }));
    style(id);
  };

  // order = z-order: groups, edges, then draggable entities on top
  for (const g of c.groups) box(g.id, g.rect, false);
  for (const e of c.edges) { kinds.set(e.id, "edge"); bind(e.id, new Konva.Line({ points: e.points, hitStrokeWidth: 14, strokeScaleEnabled: false })); style(e.id); }
  for (const o of [...c.nodes, ...c.arrays, ...c.grids, ...c.code]) box(o.id, o.rect, true);

  const showHandle = () => {
    handle?.destroy(); handle = undefined;
    const n = c.nodes.find((x) => x.id === sel);
    if (!n) return;
    const home = { x: n.rect.x + n.rect.w + 14, y: n.rect.y + n.rect.h / 2 }, from = { x: n.rect.x + n.rect.w / 2, y: n.rect.y + n.rect.h / 2 };
    const hd = new Konva.Circle({ ...home, radius: 7, fill: BLUE, stroke: "#fff", strokeWidth: 2, draggable: true, strokeScaleEnabled: false });
    const rubber = new Konva.Arrow({ points: [], stroke: BLUE, fill: BLUE, strokeWidth: 2, dash: [6, 4], listening: false, strokeScaleEnabled: false });
    hd.on("mouseenter", () => (p.stage.container().style.cursor = "crosshair"));
    hd.on("dragstart", () => { p.pause(); root.add(rubber); });
    hd.on("dragmove", () => { rubber.points([from.x, from.y, hd.x(), hd.y()]); layer.batchDraw(); });
    hd.on("dragend", (e) => {
      e.cancelBubble = true;
      const to = hit(hd.x(), hd.y());
      rubber.destroy(); hd.position(home); layer.batchDraw();
      if (to && sel) h.connect(sel, to);
    });
    root.add(hd);
    handle = hd;
  };

  return {
    /** Mirror the scene camera (called on every player render). */
    sync() { root.setAttrs({ x: p.world.x(), y: p.world.y(), scaleX: p.world.scaleX(), scaleY: p.world.scaleY() }); layer.batchDraw(); },
    setSel(id?: string) { const old = sel; sel = id; if (old && items.has(old)) style(old); if (id && items.has(id)) style(id); showHandle(); layer.batchDraw(); },
    top() { layer.moveToTop(); layer.batchDraw(); },
    destroy() { layer.destroy(); },
  };
}
