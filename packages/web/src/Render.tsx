import Konva from "konva";
import { createPlayer, loadFonts } from "@flowmotion/player";
import type { CompiledFlow } from "@flowmotion/core/runtime";

/** Render page for the worker (PRD §8): /render/:id?s=&mode=still|sheet|video&step=&captions=1&w=&h=
 *  Draws on a fixed-size stage, no controls. window.__PLAYER__ is the only interface. */
declare global { interface Window { __PLAYER__: unknown } }

const SHEET_MAX = 1600, END_EPS = 1e-3;
const fail = (e: unknown) => { document.body.textContent = String(e); throw e; };

/** Title bar + narration band over the stage. ponytail: overlays the bottom of the scene; reserve space instead if it hides content. */
function captions(stage: Konva.Stage, title: string, narration: string) {
  const { w, h } = { w: stage.width(), h: stage.height() }, layer = new Konva.Layer({ listening: false });
  const font = (o: Konva.TextConfig) => new Konva.Text({ fontFamily: "Inter", fill: "#fff", ...o });
  const t = font({ text: narration, x: 24, y: 0, width: w - 48, fontSize: Math.round(h / 36), lineHeight: 1.4 });
  const band = Math.min(h / 3, t.height() + 24);
  layer.add(
    new Konva.Rect({ width: w, height: 36, fill: "rgba(15,23,42,.85)" }), font({ text: title, x: 24, y: 9, fontSize: 18, fontStyle: "bold" }),
    new Konva.Rect({ y: h - band, width: w, height: band, fill: "rgba(15,23,42,.85)" }), t.y(h - band + 12),
  );
  stage.add(layer);
  layer.draw();
}

const pixels = (c: HTMLCanvasElement) => { const x = c.getContext("2d")!; return x.getImageData(0, 0, c.width, c.height).data; };

export async function renderPage(id: string) {
  const q = new URLSearchParams(location.search);
  const mode = q.get("mode") ?? "still", W = +(q.get("w") ?? 1280), H = +(q.get("h") ?? 720), caps = q.get("captions") === "1";
  document.body.style.cssText = "margin:0;overflow:hidden";
  const res = await fetch(`/api/share/${id}`);
  if (!res.ok) fail(`flow ${id}: ${res.status}`);
  const compiled = (await res.json()).compiled as CompiledFlow;
  await loadFonts();
  const scenarioId = q.get("s") ?? compiled.scenarios[0]!.id;
  const steps = compiled.scenarios.find((s) => s.id === scenarioId)?.steps ?? fail(`no scenario ${scenarioId}`);
  const host = document.createElement("div");
  document.body.append(host);

  const stageSize = mode === "sheet" ? { w: 800, h: 450 } : { w: W, h: H }; // sheet cells are rendered at 800x450, then downscaled
  host.style.cssText = `width:${stageSize.w}px;height:${stageSize.h}px`;
  const player = createPlayer(host as HTMLDivElement, compiled, { scenario: scenarioId, reducedMotion: false });
  const stage = player.stage;
  stage.draggable(false);
  const live = () => stage.toCanvas({ pixelRatio: 1 });
  const stepEnd = (i: number) => Math.max(0, steps[i]!.end - END_EPS);

  if (mode === "sheet") {
    const cols = Math.ceil(Math.sqrt(steps.length)), rows = Math.ceil(steps.length / cols), cell = 400, aspect = 9 / 16;
    const scale = Math.min(1, SHEET_MAX / (cols * cell));
    const cw = Math.floor(cell * scale), ch = Math.floor((cell * aspect + 24) * scale);
    const sheet = Object.assign(document.createElement("canvas"), { width: cols * cw, height: rows * ch });
    const g = sheet.getContext("2d")!;
    g.fillStyle = "#fff"; g.fillRect(0, 0, sheet.width, sheet.height);
    g.font = `bold ${Math.round(12 * scale * 1.5)}px Inter`; g.fillStyle = "#111"; g.textBaseline = "top";
    steps.forEach((s, i) => {
      player.seek(stepEnd(i));
      const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
      g.drawImage(live(), x, y + 20 * scale, cw, ch - 20 * scale);
      g.fillText(`${i + 1}. ${s.title}`, x + 4, y + 4, cw - 8);
    });
    host.remove(); document.body.append(sheet);
    window.__PLAYER__ = { ready: Promise.resolve(), duration: 0, steps, seek: async () => {}, frame: () => pixels(sheet), size: { w: sheet.width, h: sheet.height } };
    return;
  }

  const draw = (t: number) => {
    player.seek(t);
    if (caps) { stage.getLayers().slice(1).forEach((l) => l.destroy()); const s = steps.find((x) => t < x.end) ?? steps.at(-1)!; captions(stage, s.title, s.narration); }
  };
  if (mode === "video") draw(0);
  if (mode === "still") draw(q.has("step") ? stepEnd(+q.get("step")!) : player.duration);
  window.__PLAYER__ = {
    ready: Promise.resolve(), duration: player.duration, steps, size: { w: W, h: H },
    seek: async (t: number) => draw(t), // Konva draws synchronously, so resolve = drawn
    frame: () => pixels(live()),
  };
}
