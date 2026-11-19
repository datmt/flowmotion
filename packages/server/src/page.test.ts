import { expect, test } from "vitest";
import { createApp } from "./app.ts";
import { template } from "./catalog.ts";
import { excerpt, renderMarkdown } from "./markdown.ts";
import { flowPage } from "./page.ts";
import { memoryStore } from "./store.ts";

test("markdown subset renders and escapes", () => {
  const html = renderMarkdown("## Why it exists\n\nUse `a<b` and **bold** and [x](https://e.com).\n\n- one\n- two\n\n```\n<script>\n```\n\n[bad](javascript:alert(1))");
  expect(html).toContain('<h2 id="why-it-exists">Why it exists</h2>');
  expect(html).toContain("<code>a&#60;b</code>");
  expect(html).toContain('<a href="https://e.com" rel="noopener">x</a>');
  expect(html).toContain("<li>one</li>");
  expect(html).toContain("&#60;script&#62;");
  expect(html).not.toContain("<a href=\"javascript");
  expect(excerpt("## H\n\nFirst **para** here.\n\nSecond.")).toBe("First para here.");
});

test("flowPage: SEO head, article HTML, JSON-LD is script-safe", () => {
  const doc = template("algorithms/binary-search");
  const html = flowPage({ base: "http://x", domain: "algorithms", slug: "binary-search", doc, article: "## Why it exists\n\nBinary search halves the range </script> each step.", related: [] });
  expect(html).toContain('<link rel="canonical" href="http://x/f/algorithms/binary-search">');
  expect(html).toContain('"@type":"TechArticle"');
  expect(html).toContain("Binary search halves the range");
  expect(html.match(/<\/script>/g)!.length).toBe(2); // ld+json and flow-player.js only
});

test("routes: /f page and .md, /api/catalog, sitemap, robots, 404", async () => {
  const server = createApp({ store: memoryStore(), env: { PUBLIC_URL: "http://x" } }).listen(0);
  const b = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const page = await fetch(`${b}/f/algorithms/binary-search`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("<flow-player");
    expect((await fetch(`${b}/f/algorithms/binary-search.md`)).headers.get("content-type")).toContain("markdown");
    expect((await fetch(`${b}/f/algorithms/nope`)).status).toBe(404);
    const snap = await (await fetch(`${b}/api/catalog/algorithms/binary-search`)).json() as any;
    expect(snap.compiled.scenarios.length).toBeGreaterThan(0);
    expect(await (await fetch(`${b}/sitemap.xml`)).text()).toContain("http://x/f/algorithms/binary-search");
    expect(await (await fetch(`${b}/robots.txt`)).text()).toContain("Sitemap: http://x/sitemap.xml");
  } finally { server.close(); }
});
