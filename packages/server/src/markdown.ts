const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const inline = (s: string) =>
  esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>'); // http(s) only; text/url already escaped

/** The article subset only (see docs/article-guide.md): ## headings, paragraphs, - bullets, fenced code, `code`, **bold**, [links](https://..). Escapes everything else. */
export function renderMarkdown(md: string): string {
  const out: string[] = [];
  let para: string[] = [], list: string[] = [], code: string[] | undefined;
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    if (list.length) out.push(`<ul>${list.map((l) => `<li>${inline(l)}</li>`).join("")}</ul>`);
    para = []; list = [];
  };
  for (const line of md.split(/\r?\n/)) {
    if (code) { if (line.startsWith("```")) { out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`); code = undefined; } else code.push(line); continue; }
    if (line.startsWith("```")) { flush(); code = []; continue; }
    const h = /^(#{2,3}) (.+)/.exec(line);
    if (h) { flush(); const t = h[2]!, id = t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); out.push(`<h${h[1]!.length} id="${id}">${inline(t)}</h${h[1]!.length}>`); continue; }
    const b = /^[-*] (.+)/.exec(line);
    if (b) { if (para.length) flush(); list.push(b[1]!); continue; }
    if (!line.trim()) { flush(); continue; }
    if (list.length) flush();
    para.push(line.trim());
  }
  flush();
  return out.join("\n");
}

/** First paragraph, plain text: the excerpt for meta description / JSON-LD. */
export const excerpt = (md: string, max = 200) => {
  const p = md.split(/\n\s*\n/).map((x) => x.trim()).find((x) => x && !x.startsWith("#") && !x.startsWith("```") && !/^[-*] /.test(x)) ?? "";
  const t = p.replace(/\s+/g, " ").replace(/`|\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  return t.length <= max ? t : t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
};
