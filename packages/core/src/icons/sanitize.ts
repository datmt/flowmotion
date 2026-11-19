/** F41: turns untrusted SVG text into a local icon `{body, w, h}`. Whitelist rebuild, not a blacklist: only drawing
 *  elements and plain geometry/colour attributes survive; scripts, styles, event handlers, hrefs, `url()` refs,
 *  <foreignObject>, <image>, <use> and everything inside <defs>/<mask>/<clipPath>/<symbol> are dropped.
 *  Gradient fills become the gradient's first stop colour (the player draws flat paths). */
export interface LocalIcon { body: string; w: number; h: number }
export const MAX_ICON_BYTES = 20 * 1024;

const SHAPES = new Set(["g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon"]);
const SKIP = new Set(["defs", "mask", "clippath", "symbol", "script", "style", "foreignobject", "title", "desc", "metadata", "lineargradient", "radialgradient", "pattern", "filter", "text", "image"]);
const NUM = /^-?\d*\.?\d+(e-?\d+)?$/i, PATH = /^[\sMmLlHhVvCcSsQqTtAaZz0-9eE.,+-]*$/, POINTS = /^[\s0-9eE.,+-]*$/;
const COLOR = /^(none|currentColor|#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\([\s\d.,%]+\))$/i;
const ENUM: Record<string, RegExp> = { "stroke-linecap": /^(butt|round|square)$/, "stroke-linejoin": /^(miter|round|bevel)$/ };
const NUMERIC = ["cx", "cy", "r", "rx", "ry", "x", "y", "width", "height", "x1", "y1", "x2", "y2", "stroke-width"];

const attrs = (s: string) => Object.fromEntries([...s.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => [m[1]!.toLowerCase(), (m[2] ?? m[3])!]));

export function sanitizeSvg(text: string): LocalIcon | { error: string } {
  if (text.length > MAX_ICON_BYTES) return { error: `larger than ${MAX_ICON_BYTES / 1024} KB` };
  const src = text.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>/gi, "");
  const root = /<svg\b([^>]*)>/i.exec(src);
  if (!root) return { error: "not an SVG" };
  const ra = attrs(root[1]!), vb = (ra.viewbox ?? "").trim().split(/[\s,]+/).map(Number);
  let w: number, h: number;
  if (vb.length === 4 && vb.every(Number.isFinite)) {
    if (vb[0] !== 0 || vb[1] !== 0) return { error: "viewBox must start at 0 0" }; // ponytail: no origin shifting; re-export from the design tool
    [w, h] = [vb[2]!, vb[3]!];
  } else { w = parseFloat(ra.width ?? ""); h = parseFloat(ra.height ?? ""); }
  if (!(w > 0 && h > 0 && w <= 4096 && h <= 4096)) return { error: "needs a viewBox (or width and height)" };

  // gradient id → first stop colour
  const grad = new Map<string, string>();
  for (const g of src.matchAll(/<(?:linear|radial)Gradient\b([^>]*)>([\s\S]*?)<\/(?:linear|radial)Gradient>/gi)) {
    const id = attrs(g[1]!).id, stop = /<stop\b([^>]*)>/i.exec(g[2]!);
    const sa = stop ? attrs(stop[1]!) : {}, c = sa["stop-color"] ?? /stop-color\s*:\s*([^;"]+)/i.exec(sa.style ?? "")?.[1]?.trim();
    if (id && c && COLOR.test(c)) grad.set(id, c);
  }
  const color = (v: string): string | undefined => {
    const u = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)$/.exec(v.trim());
    if (u) return grad.get(u[1]!);
    return COLOR.test(v.trim()) ? v.trim() : undefined;
  };

  const out: string[] = [];
  let skip = 0;
  const end = src.toLowerCase().lastIndexOf("</svg"), inner = src.slice(root.index + root[0].length, end < 0 ? undefined : end);
  for (const m of inner.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g)) {
    const [, close, rawTag, rest, self] = m, tag = rawTag!.toLowerCase();
    if (SKIP.has(tag)) { if (!self) skip += close ? -1 : 1; continue; }
    if (skip > 0) continue;
    if (!SHAPES.has(tag)) continue;
    if (close) { if (tag === "g") out.push("</g>"); continue; }
    const a = attrs(rest!), keep: string[] = [];
    for (const k of NUMERIC) if (a[k] !== undefined && NUM.test(a[k]!.trim().replace(/px$/, ""))) keep.push(`${k}="${a[k]!.trim().replace(/px$/, "")}"`);
    if (a.d !== undefined && PATH.test(a.d)) keep.push(`d="${a.d}"`);
    if (a.points !== undefined && POINTS.test(a.points)) keep.push(`points="${a.points}"`);
    for (const k of ["fill", "stroke"]) if (a[k] !== undefined) { const c = color(a[k]!); if (c) keep.push(`${k}="${c}"`); }
    for (const [k, re] of Object.entries(ENUM)) if (a[k] && re.test(a[k]!)) keep.push(`${k}="${a[k]}"`);
    if (tag === "path" && !a.d) continue;
    out.push(tag === "g" ? (self ? "" : `<g ${keep.join(" ")}>`) : `<${tag} ${keep.join(" ")}/>`);
  }
  // an unbalanced <g> would make normalizeBody's stack lie; close what is open
  let depth = 0;
  for (const s of out) depth += s.startsWith("<g ") ? 1 : s === "</g>" ? -1 : 0;
  const body = out.join("") + "</g>".repeat(Math.max(depth, 0));
  if (!/<(path|circle|ellipse|rect|line|polyline|polygon) /.test(body)) return { error: "no drawable shapes" };
  return { body, w, h };
}

/** `Arch_Amazon-Simple-Storage-Service_48.svg` → `amazon-simple-storage-service` (valid `local:<name>`), or undefined. */
export function localIconName(file: string): string | undefined {
  const n = file.replace(/^.*[\\/]/, "").replace(/\.svg$/i, "").replace(/^(arch|res|arch-category)[-_ ]/i, "").replace(/[-_ ]\d{2,3}$/, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return n || undefined;
}
