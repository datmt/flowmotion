/** Parser for the lesson-article subset (docs/article-guide.md): `##`/`###` headings, paragraphs, `-` bullets, fenced code, `code`, **bold**, [text](https://..). No HTML passes through; renderers (server HTML, player DOM) build from this tree. */
export type Inline = { t: "text" | "code" | "b"; s: string } | { t: "a"; s: string; href: string };
export type Block =
  | { t: "h"; l: 2 | 3; text: string; inl: Inline[] }
  | { t: "p"; inl: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "pre"; s: string };

export function parseInline(s: string): Inline[] {
  return s.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/).filter(Boolean).map((p): Inline => {
    if (p.startsWith("`")) return { t: "code", s: p.slice(1, -1) };
    if (p.startsWith("**")) return { t: "b", s: p.slice(2, -2) };
    const m = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(p);
    return m ? { t: "a", s: m[1]!, href: m[2]! } : { t: "text", s: p };
  });
}

export function parseMarkdown(md: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [], list: string[] = [], code: string[] | undefined;
  const flush = () => {
    if (para.length) out.push({ t: "p", inl: parseInline(para.join(" ")) });
    if (list.length) out.push({ t: "ul", items: list.map(parseInline) });
    para = []; list = [];
  };
  for (const line of md.split(/\r?\n/)) {
    if (code) { if (line.startsWith("```")) { out.push({ t: "pre", s: code.join("\n") }); code = undefined; } else code.push(line); continue; }
    if (line.startsWith("```")) { flush(); code = []; continue; }
    const h = /^(#{2,3}) (.+)/.exec(line);
    if (h) { flush(); out.push({ t: "h", l: h[1]!.length as 2 | 3, text: h[2]!, inl: parseInline(h[2]!) }); continue; }
    const b = /^[-*] (.+)/.exec(line);
    if (b) { if (para.length) flush(); list.push(b[1]!); continue; }
    if (!line.trim()) { flush(); continue; }
    if (list.length) flush();
    para.push(line.trim());
  }
  flush();
  return out;
}
