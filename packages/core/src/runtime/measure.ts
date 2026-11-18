import glyphs from "./glyphs.json" with { type: "json" };

export type Font = keyof typeof glyphs; // "inter" | "inter-bold" | "mono"

/** Deterministic text width in px (advance widths only; no kerning — ponytail: add kerning pairs if labels look loose). */
export function measure(text: string, font: Font, size: number): number {
  const g = glyphs[font];
  let w = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    w += c >= 32 && c <= 255 ? g.w[c - 32]! : c > 0x2e7f ? 1000 : g.fallback;
  }
  return (w * size) / 1000;
}

/** Greedy word wrap. `overflow` = text needed more than `maxLines`; the last line is then ellipsised. */
export function wrap(text: string, maxWidth: number, font: Font, size: number, maxLines = 2): { lines: string[]; overflow: boolean } {
  const fits = (s: string) => measure(s, font, size) <= maxWidth;
  const lines: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (fits(next)) { cur = next; continue; }
    if (cur) lines.push(cur);
    cur = word;
    while (!fits(cur) && cur.length > 1) { // hard-break a word wider than the box
      let n = cur.length - 1;
      while (n > 1 && !fits(cur.slice(0, n))) n--;
      lines.push(cur.slice(0, n));
      cur = cur.slice(n);
    }
  }
  if (cur) lines.push(cur);
  const overflow = lines.length > maxLines;
  if (!overflow) return { lines, overflow };
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1]!;
  while (last.length > 1 && !fits(last + "…")) last = last.slice(0, -1);
  kept[maxLines - 1] = last + "…";
  return { lines: kept, overflow };
}
