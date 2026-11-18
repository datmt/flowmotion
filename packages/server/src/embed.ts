import { build } from "esbuild";

const entry = new URL("../../player/src/index.ts", import.meta.url).pathname;
const stub = new URL("./app-view.core-stub.ts", import.meta.url).pathname;

// ponytail: built lazily on first request and cached for the process; prebuild in CI if cold-start matters.
let js: Promise<string> | undefined;
/** Standalone `<flow-player>` script for third-party pages. Takes snapshot URLs (compiled flows); the compiler is not bundled. */
export const playerScript = () => (js ??= (async () => {
  const r = await build({
    entryPoints: [entry], bundle: true, write: false, format: "iife", minify: true, target: "es2022",
    // fonts resolve relative to the script's own URL: `../../../assets/fonts/x` → `<origin>/assets/fonts/x`
    banner: { js: "var __fp=(document.currentScript&&document.currentScript.src)||location.href;" },
    define: { "import.meta.url": "__fp" },
    plugins: [{ name: "stub-core", setup: (b) => b.onResolve({ filter: /^@flowmotion\/core$/ }, () => ({ path: stub })) }],
  });
  return r.outputFiles[0]!.text;
})());

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
/** Share-card <head> tags for a snapshot. */
export const cardMeta = (o: { title: string; description?: string; url: string; image?: string }) =>
  [`<title>${esc(o.title)} · Flowmotion</title>`, ["og:title", o.title], ["og:type", "website"], ["og:url", o.url], ...(o.description ? [["og:description", o.description], ["description", o.description]] : []),
    ...(o.image ? [["og:image", o.image], ["twitter:card", "summary_large_image"]] : [])]
    .map((t) => (typeof t === "string" ? t : `<meta ${t[0]!.startsWith("og:") ? "property" : "name"}="${t[0]}" content="${esc(t[1]!)}">`)).join("");
