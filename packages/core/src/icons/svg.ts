/** Normalises an Iconify icon body (<g>/<path>/<circle>/<rect>/<ellipse>/<line>/<polyline>/<polygon>) into plain path records. */
export interface IconPath { d: string; fill?: string; stroke?: string; sw?: number; cap?: string; join?: string }
export type { CompiledIcon } from "../runtime/compiled.ts";
import type { CompiledIcon } from "../runtime/compiled.ts";

const attrs = (s: string) => Object.fromEntries([...s.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1]!, m[2]!]));
const n = (v: string | undefined, d = 0) => (v === undefined ? d : Number(v));
const arc = (cx: number, cy: number, rx: number, ry: number) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;

function shape(tag: string, a: Record<string, string>): string | undefined {
  switch (tag) {
    case "path": return a.d;
    case "circle": return arc(n(a.cx), n(a.cy), n(a.r), n(a.r));
    case "ellipse": return arc(n(a.cx), n(a.cy), n(a.rx), n(a.ry));
    case "line": return `M${n(a.x1)} ${n(a.y1)}L${n(a.x2)} ${n(a.y2)}`;
    case "polyline": case "polygon": {
      const v = (a.points ?? "").trim().split(/[\s,]+/).filter(Boolean);
      return v.length >= 4 ? v.map((x, i) => (i % 2 ? x : `${i ? "L" : "M"}${x}`)).join(" ").replace(/ L/g, "L") + (tag === "polygon" ? "Z" : "") : undefined;
    }
    case "rect": {
      const x = n(a.x), y = n(a.y), w = n(a.width), h = n(a.height), rx = Math.min(n(a.rx ?? a.ry), w / 2), ry = Math.min(n(a.ry ?? a.rx), h / 2);
      return rx || ry
        ? `M${x + rx} ${y}H${x + w - rx}a${rx} ${ry} 0 0 1 ${rx} ${ry}V${y + h - ry}a${rx} ${ry} 0 0 1 ${-rx} ${ry}H${x + rx}a${rx} ${ry} 0 0 1 ${-rx} ${-ry}V${y + ry}a${rx} ${ry} 0 0 1 ${rx} ${-ry}Z`
        : `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
    }
  }
}

export function normalizeBody(body: string, w = 24, h = 24): CompiledIcon {
  const paths: IconPath[] = [], stack: Record<string, string>[] = [{}];
  for (const m of body.matchAll(/<(\/?)(\w+)([^>]*?)(\/?)>/g)) {
    const [, close, tag, rest, self] = m;
    if (tag === "g") { if (close) stack.pop(); else { const top = { ...stack.at(-1)!, ...attrs(rest!) }; if (self) continue; stack.push(top); } continue; }
    if (close) continue;
    const a = { ...stack.at(-1)!, ...attrs(rest!) }, d = shape(tag!, a);
    if (!d) continue;
    paths.push({ d, fill: a.fill ?? "currentColor", ...(a.stroke && { stroke: a.stroke }), ...(a["stroke-width"] && { sw: Number(a["stroke-width"]) }), ...(a["stroke-linecap"] && { cap: a["stroke-linecap"] }), ...(a["stroke-linejoin"] && { join: a["stroke-linejoin"] }) });
  }
  const mono = paths.every((p) => [p.fill, p.stroke].every((c) => c === undefined || c === "none" || c === "currentColor"));
  return { w, h, paths, mono };
}
