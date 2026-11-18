import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { BlobStore } from "./store.ts";
import { mcpHandler } from "./mcp.ts";
import * as tools from "./tools.ts";

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

export function createApp({ store, env }: { store: BlobStore; env: Env }) {
  const app = express();
  app.disable("x-powered-by");
  if (env.TRUST_PROXY) app.set("trust proxy", Number(env.TRUST_PROXY)); // hops, so req.ip is the real client
  app.use(express.json({ limit: "2mb" })); // doc limit is 1 MB; ops/previews fit under 2
  const c: tools.Ctx = { store, baseUrl: env.PUBLIC_URL };
  const read = limit(Number(env.RATE_LIMIT_READ ?? 300)), write = limit(Number(env.RATE_LIMIT_WRITE ?? 20));

  app.get("/healthz", (_req, res) => void res.json({ ok: true }));
  app.get("/schema/flow-2.1.json", (_req, res) => void res.type("json").send(readFileSync(new URL("../../../schema/flow-2.1.json", import.meta.url))));
  app.get("/llms.txt", (_req, res) => void res.type("text/plain").send(tools.guide()));

  const api = express.Router();
  api.get("/share/:id", read, async (req, res) => void res.json(await tools.snapshot(c, String(req.params.id))));
  api.get("/share/:id/dsl", read, async (req, res) => void res.type("text/plain").send((await tools.get(c, { id: String(req.params.id), view: "dsl" }) as { dsl: string }).dsl));
  api.post("/validate", write, async (req, res) => void res.json(await tools.check(req.body ?? {})));
  api.post("/ops", write, async (req, res) => void res.json(tools.applyToDoc(req.body?.doc, req.body?.ops)));
  api.post("/share", write, async (req, res) => void res.status(201).json(await tools.publish(c, tools.docOf(req.body ?? {}))));
  api.post("/share/:id/ops", write, async (req, res) => void res.status(201).json(await tools.edit(c, { id: String(req.params.id), ops: req.body?.ops, dsl: req.body?.dsl })));
  app.use("/api", api);
  app.post("/mcp", write, mcpHandler(c));
  app.all("/mcp", (_req, res) => void res.status(405).set("allow", "POST").json({ error: "method_not_allowed" })); // stateless: no SSE/session

  // Built web app + SPA fallback (client routes: /, /v/:id, /local/:id). Skipped when not built.
  const dist = env.WEB_DIST ?? fileURLToPath(new URL("../../web/dist", import.meta.url));
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api\/|mcp|schema\/|llms\.txt).*/, (_req, res) => void res.sendFile(`${dist}/index.html`));
  }

  app.use(((err, _req, res, _next) => {
    if (err instanceof tools.ToolError) return void res.status(err.status).json(err.body);
    if (err.status) return void res.status(err.status).json({ error: "bad_request", message: err.message });
    console.error(err);
    res.status(500).json({ error: "internal" });
  }) as ErrorRequestHandler);
  return app;
}
