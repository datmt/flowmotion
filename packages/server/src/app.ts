import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { BlobStore } from "./store.ts";
import { mcpHandler } from "./mcp.ts";
import * as tools from "./tools.ts";
import { cardMeta, playerScript } from "./embed.ts";
import { anthropicModel, editWithAI, generate, type Model } from "./generate.ts";

export type Env = Record<string, string | undefined>;

// ponytail: fixed window per IP, per process. Move to edge/Cloudflare rules when >1 instance.
function limit(max: number, windowMs = 60_000): RequestHandler {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req, res, next) => {
    const now = Date.now();
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    let w = hits.get(req.ip ?? "");
    if (!w || w.reset < now) hits.set(req.ip ?? "", (w = { n: 0, reset: now + windowMs }));
    if (++w.n > max) return void res.status(429).set("retry-after", String(Math.ceil((w.reset - now) / 1000))).json({ error: "rate_limited" });
    next();
  };
}

export function createApp({ store, env, renderer, model }: { store: BlobStore; env: Env; renderer?: tools.Renderer; model?: Model }) {
  const app = express();
  app.disable("x-powered-by");
  if (env.TRUST_PROXY) app.set("trust proxy", Number(env.TRUST_PROXY)); // hops, so req.ip is the real client
  app.use(express.json({ limit: "2mb" })); // doc limit is 1 MB; ops/previews fit under 2
  model ??= env.ANTHROPIC_API_KEY ? anthropicModel(env.ANTHROPIC_API_KEY) : undefined;
  const ai = limit(Number(env.RATE_LIMIT_AI ?? 5)); // the server pays for the model
  const needModel = () => model ?? (() => { throw new tools.ToolError(501, { error: "not_available", message: "AI is not enabled on this server (no ANTHROPIC_API_KEY)." }); })();
  const c: tools.Ctx = { store, baseUrl: env.PUBLIC_URL, renderer };
  const read = limit(Number(env.RATE_LIMIT_READ ?? 300)), write = limit(Number(env.RATE_LIMIT_WRITE ?? 20)), render = limit(Number(env.RATE_LIMIT_RENDER ?? 10));

  app.get("/healthz", (_req, res) => void res.json({ ok: true }));
  app.get("/schema/flow-2.1.json", (_req, res) => void res.type("json").send(readFileSync(new URL("../../../schema/flow-2.1.json", import.meta.url))));
  // Embeds on other sites fetch the script, fonts and snapshot cross-origin: all public, read-only.
  app.use(["/flow-player.js", "/assets/fonts", "/api/share"], (req, res, next) => { if (req.method === "GET") res.set("access-control-allow-origin", "*"); next(); });
  app.get("/flow-player.js", async (_req, res) => void res.type("js").set("cache-control", "public, max-age=3600").send(await playerScript()));
  app.use("/assets/fonts", express.static(fileURLToPath(new URL("../../../assets/fonts", import.meta.url)), { maxAge: "1d" }));
  app.get("/llms.txt", (_req, res) => void res.type("text/plain").send(tools.guide()));

  const api = express.Router();
  api.get("/share/:id", read, async (req, res) => void res.json(await tools.snapshot(c, String(req.params.id))));
  api.get("/share/:id/og.png", read, async (req, res) => void res.type("png").set("cache-control", "public, max-age=86400").send(Buffer.from(await tools.ogImage(c, String(req.params.id)))));
  api.get("/share/:id/dsl", read, async (req, res) => void res.type("text/plain").send((await tools.get(c, { id: String(req.params.id), view: "dsl" }) as { dsl: string }).dsl));
  api.get("/icons", read, async (req, res) => void res.json(await tools.icons({ query: String(req.query.q ?? ""), pack: req.query.pack ? String(req.query.pack) : undefined, limit: req.query.limit ? Number(req.query.limit) : undefined })));
  api.post("/validate", write, async (req, res) => void res.json(await tools.check(req.body ?? {})));
  api.post("/ops", write, async (req, res) => void res.json(tools.applyToDoc(req.body?.doc, req.body?.ops)));
  api.post("/share", write, async (req, res) => void res.status(201).json(await tools.publish(c, tools.docOf(req.body ?? {}))));
  api.post("/share/:id/ops", write, async (req, res) => void res.status(201).json(await tools.edit(c, { id: String(req.params.id), ops: req.body?.ops, dsl: req.body?.dsl })));
  api.post("/share/:id/preview", render, async (req, res) => void res.type("png").send(Buffer.from((await tools.preview(c, { ...req.body, id: String(req.params.id) })).png)));
  api.post("/share/:id/export", render, async (req, res) => void res.status(202).json(await tools.startExport(c, { ...req.body, id: String(req.params.id) })));
  api.get("/jobs/:id", read, (req, res) => void res.json(tools.job(c, String(req.params.id))));
  api.get("/jobs/:id/events", read, async (req, res) => {
    res.set({ "content-type": "text/event-stream", "cache-control": "no-cache" }).flushHeaders();
    const ctl = new AbortController();
    res.on("close", () => ctl.abort());
    try { await tools.watch(c, String(req.params.id), (j) => { if (!ctl.signal.aborted) res.write(`data: ${JSON.stringify(j)}\n\n`); }, ctl.signal); } catch { /* unknown job: just end */ }
    res.end();
  });
  api.get("/jobs/:id/file", read, async (req, res) => {
    const f = await tools.jobFile(c, String(req.params.id));
    res.type(f.ext).send(Buffer.from(f.bytes));
  });
  api.post("/generate", ai, async (req, res) => {
    const m = needModel(), prompt = req.body?.prompt;
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 4000) throw new tools.ToolError(422, { error: "invalid", message: "prompt must be 1-4000 characters." });
    res.set({ "content-type": "text/event-stream", "cache-control": "no-cache" }).flushHeaders();
    try { for await (const ev of generate(c, m, { prompt })) res.write(`data: ${JSON.stringify(ev)}\n\n`); }
    catch (e) { res.write(`data: ${JSON.stringify({ type: "error", message: e instanceof tools.ToolError ? String(e.body.message ?? e.body.error) : "Generation failed." })}\n\n`); if (!(e instanceof tools.ToolError)) console.error(e); }
    res.end();
  });
  api.post("/ai-edit", ai, async (req, res) => {
    const { doc, instruction, selectedIds } = req.body ?? {};
    if (typeof instruction !== "string" || !instruction.trim() || instruction.length > 2000) throw new tools.ToolError(422, { error: "invalid", message: "instruction must be 1-2000 characters." });
    res.json(await editWithAI(needModel(), { doc, instruction, selectedIds: Array.isArray(selectedIds) ? selectedIds.map(String) : [] }));
  });
  app.use("/api", api);
  app.post("/mcp", write, mcpHandler(c));
  app.all("/mcp", (_req, res) => void res.status(405).set("allow", "POST").json({ error: "method_not_allowed" })); // stateless: no SSE/session

  // Built web app + SPA fallback (client routes: /, /v/:id, /local/:id, /edit/:id). Skipped when not built.
  const dist = env.WEB_DIST ?? fileURLToPath(new URL("../../web/dist", import.meta.url));
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: false }));
    // Share cards: /v/:id gets og/twitter tags from the snapshot (unknown ids fall through to the SPA's not-found view).
    app.get("/v/:id", read, async (req, res, next) => {
      try {
        const id = String(req.params.id), { doc } = await tools.snapshot(c, id), base = c.baseUrl ?? `${req.protocol}://${req.get("host")}`;
        const meta = cardMeta({ title: doc.meta.title, description: doc.meta.summary, url: `${base}/v/${id}`, image: renderer ? `${base}/api/share/${id}/og.png` : undefined });
        res.type("html").send(readFileSync(`${dist}/index.html`, "utf8").replace("<title>Flowmotion</title>", () => meta));
      } catch (e) { if (e instanceof tools.ToolError && e.status === 404) return next(); next(e); }
    });
    app.get(/^\/(?!api\/|mcp|schema\/|llms\.txt|flow-player\.js|assets\/).*/, (_req, res) => void res.sendFile(`${dist}/index.html`));
  }

  app.use(((err, _req, res, _next) => {
    if (err instanceof tools.ToolError) return void res.status(err.status).json(err.body);
    if (err.status) return void res.status(err.status).json({ error: "bad_request", message: err.message });
    console.error(err);
    res.status(500).json({ error: "internal" });
  }) as ErrorRequestHandler);
  return app;
}
