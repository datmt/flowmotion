import type { FlowDoc } from "@flowmotion/core";
import { excerpt, renderMarkdown } from "./markdown.ts";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
export const domainName = (d: string) => d.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Server-rendered lesson page `/f/<domain>/<slug>`: crawlers and AI assistants get the article as plain HTML; people get the player too. */
export function flowPage(o: { base: string; domain: string; slug: string; doc: FlowDoc; article?: string; related: { path: string; title: string }[] }): string {
  const { base, domain, slug, doc, article } = o, m = doc.meta, url = `${base}/f/${domain}/${slug}`;
  const desc = (article && excerpt(article)) || m.summary || m.title;
  const ld = {
    "@context": "https://schema.org", "@type": "TechArticle", headline: m.title, description: desc, url, inLanguage: "en",
    about: m.tags, proficiencyLevel: m.level, isAccessibleForFree: true, license: "https://creativecommons.org/licenses/by/4.0/",
    ...(m.sources?.length ? { citation: m.sources } : {}), articleSection: domainName(domain),
    mainEntityOfPage: url,
  };
  const head = [
    `<title>${esc(m.title)} · ${esc(domainName(domain))} · Flowmotion</title>`,
    `<meta name="description" content="${esc(desc)}">`, `<link rel="canonical" href="${esc(url)}">`,
    `<link rel="alternate" type="text/markdown" href="${esc(url)}.md">`,
    ...[["og:title", m.title], ["og:description", desc], ["og:type", "article"], ["og:url", url]].map(([k, v]) => `<meta property="${k}" content="${esc(v!)}">`),
    ...(m.tags?.length ? [`<meta name="keywords" content="${esc(m.tags.join(", "))}">`] : []),
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`,
  ].join("\n");
  const css = `body{margin:0;font:17px/1.65 system-ui,sans-serif;color:#1c1917;background:#fafaf9}main{max-width:46rem;margin:0 auto;padding:1.5rem 1rem 4rem}
h1{font-size:2rem;line-height:1.2;margin:.2em 0}h2{margin-top:2em}.meta{color:#78716c;font-size:.9rem}.player{height:min(70vh,520px);margin:1.2rem 0;border:1px solid #d6d3d1;border-radius:8px;overflow:hidden}
code{background:#e7e5e4;padding:0 .25em;border-radius:3px;font-size:.9em}pre{background:#1c1917;color:#fafaf9;padding:1rem;overflow:auto;border-radius:6px}pre code{background:none}a{color:#2563eb}
.tag{display:inline-block;background:#e7e5e4;border-radius:99px;padding:0 .6em;margin-right:.3em;font-size:.8rem}nav a{margin-right:1rem}
@media(prefers-color-scheme:dark){body{background:#1c1917;color:#e7e5e4}code,.tag{background:#44403c}.player{border-color:#44403c}a{color:#93c5fd}}`;
  const body = `<main>
<nav><a href="/">Flowmotion</a><a href="/t/${domain}/${slug}">Open in app</a></nav>
<p class="meta">${esc(domainName(domain))}${m.level ? ` · ${esc(m.level)}` : ""}</p>
<h1>${esc(m.title)}</h1>
${m.summary ? `<p>${esc(m.summary)}</p>` : ""}
<div class="player"><flow-player src="/api/catalog/${domain}/${slug}"></flow-player></div>
<noscript><p>The interactive animation needs JavaScript. The lesson below covers the same steps.</p></noscript>
<article>${article ? renderMarkdown(article) : "<p><em>The written lesson for this flow is coming soon.</em></p>"}</article>
${m.tags?.length ? `<p>${m.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</p>` : ""}
${o.related.length ? `<h2>Related flows</h2><ul>${o.related.map((r) => `<li><a href="/f/${r.path}">${esc(r.title)}</a></li>`).join("")}</ul>` : ""}
<p class="meta">Text and animation: <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.</p>
</main>
<script src="/flow-player.js"></script>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n${head}\n<style>${css}</style></head><body>${body}</body></html>`;
}

export const sitemap = (base: string, paths: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `<url><loc>${esc(base)}/f/${p}</loc></url>`).join("\n")}\n</urlset>\n`;
