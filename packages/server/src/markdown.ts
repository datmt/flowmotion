import { parseMarkdown, type Inline } from "@flowmotion/core/runtime";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const inl = (xs: Inline[]) => xs.map((x) => (x.t === "code" ? `<code>${esc(x.s)}</code>` : x.t === "b" ? `<strong>${esc(x.s)}</strong>` : x.t === "a" ? `<a href="${esc(x.href)}" rel="noopener">${esc(x.s)}</a>` : esc(x.s))).join("");

/** Article Markdown (see parseMarkdown for the subset) to HTML; everything else is escaped. */
export const renderMarkdown = (md: string) => parseMarkdown(md).map((b) =>
  b.t === "h" ? `<h${b.l} id="${b.text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}">${inl(b.inl)}</h${b.l}>`
  : b.t === "p" ? `<p>${inl(b.inl)}</p>`
  : b.t === "ul" ? `<ul>${b.items.map((i) => `<li>${inl(i)}</li>`).join("")}</ul>`
  : `<pre><code>${esc(b.s)}</code></pre>`).join("\n");

/** First paragraph, plain text: the excerpt for meta description / JSON-LD. */
export const excerpt = (md: string, max = 200) => {
  const p = parseMarkdown(md).find((b) => b.t === "p");
  const t = p && p.t === "p" ? p.inl.map((x) => x.s).join("").replace(/\s+/g, " ") : "";
  return t.length <= max ? t : t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
};
