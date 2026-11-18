import { build } from "esbuild";

const entry = new URL("../../player/src/mcp-app.ts", import.meta.url).pathname;
const stub = new URL("./app-view.core-stub.ts", import.meta.url).pathname;

// ponytail: built lazily on first resources/read and cached for the process; prebuild in CI if cold-start matters.
let html: Promise<string> | undefined;
export const playerHtml = () => (html ??= (async () => {
  const r = await build({
    entryPoints: [entry], bundle: true, write: false, format: "iife", minify: true, target: "es2022",
    define: { "import.meta.url": '"http://localhost/"' }, // font URLs only; fonts fall back to system in the sandbox
    // The view gets a compiled flow, so the lazily-imported compiler (zod/elk/shiki) is stubbed out.
    plugins: [{ name: "stub-core", setup: (b) => b.onResolve({ filter: /^@flowmotion\/core$/ }, () => ({ path: stub })) }],
  });
  const js = r.outputFiles[0]!.text.replaceAll("</script", "<\\/script");
  return `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>html,body{margin:0}flow-player{display:block}#open{display:block;text-align:right;padding:4px 8px;font:13px system-ui}</style><a id=open href=# hidden>Open in editor ↗</a><script>${js}</script>`;
})());
