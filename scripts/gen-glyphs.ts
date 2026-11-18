// Writes advance widths (per 1000 em) for U+0020..U+00FF from the bundled fonts. Run: pnpm gen:glyphs
import * as fontkit from "fontkit";
import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../assets/fonts/", import.meta.url);
const files = {
  inter: "inter-latin-400-normal.woff2",
  "inter-bold": "inter-latin-700-normal.woff2",
  mono: "jetbrains-mono-latin-400-normal.woff2",
} as const;

const out: Record<string, { w: number[]; fallback: number }> = {};
for (const [name, file] of Object.entries(files)) {
  const font = fontkit.create(readFileSync(new URL(file, dir))) as fontkit.Font;
  const scale = 1000 / font.unitsPerEm;
  const w: number[] = [];
  for (let c = 32; c <= 255; c++) {
    const g = font.glyphForCodePoint(c);
    w.push(g.id === 0 ? 0 : Math.round(g.advanceWidth * scale));
  }
  const m = w["M".charCodeAt(0) - 32]!;
  out[name] = { w: w.map((x) => x || m), fallback: m }; // missing glyph → width of "M"
}
writeFileSync(new URL("../packages/core/src/runtime/glyphs.json", import.meta.url), JSON.stringify(out) + "\n");
