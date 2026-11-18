import express, { type ErrorRequestHandler } from "express";
import { readFileSync } from "node:fs";
import { authenticate, need } from "./auth.ts";
import type { Db } from "./db.ts";
import * as tools from "./tools.ts";

export type Env = Record<string, string | undefined>;

export function createApp({ db, env }: { db: Db; env: Env }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb" })); // doc limit is 1 MB; ops/previews fit under 2
  app.get("/healthz", async (_req, res) => {
    await db.query("SELECT 1");
    res.json({ ok: true });
  });

  // public
  app.get("/schema/flow-2.1.json", (_req, res) => void res.type("json").send(readFileSync(new URL("../../../schema/flow-2.1.json", import.meta.url))));
  app.get("/llms.txt", (_req, res) => void res.type("text/plain").send(tools.guide()));
  app.get("/api/flows/:id/compiled", async (req, res) => {
    const rev = req.query.rev ? Number(req.query.rev) : undefined;
    res.json(await tools.compiledFor(db, String(req.params.id), rev));
  });

  // authenticated
  const api = express.Router();
  api.use(authenticate(db, Number(env.RATE_LIMIT ?? 120)));
  const ctx = (req: express.Request, res: express.Response): tools.Ctx => ({ db, workspace: res.locals.auth.workspace, baseUrl: env.PUBLIC_URL, author: "agent", client: req.header("user-agent") });
  api.get("/flows", need("read"), async (req, res) => void res.json(await tools.list(ctx(req, res), { query: req.query.query as string | undefined })));
  api.get("/flows/:id", need("read"), async (req, res) => {
    const ids = req.query.ids ? String(req.query.ids).split(",") : undefined;
    res.json(await tools.get(ctx(req, res), { id: String(req.params.id), view: req.query.view === "full" ? "full" : "outline", ids }));
  });
  api.post("/flows", need("write"), async (req, res) => void res.status(req.body?.dryRun ? 200 : 201).json(await tools.create(ctx(req, res), req.body ?? {})));
  api.post("/flows/:id/ops", need("write"), async (req, res) => void res.json(await tools.edit(ctx(req, res), { id: String(req.params.id), baseRevision: req.body?.baseRevision, ops: req.body?.ops })));
  api.post("/flows/:id/revert", need("write"), async (req, res) => void res.json(await tools.revert(ctx(req, res), { id: String(req.params.id), toRevision: req.body?.toRevision })));
  app.use("/api", api);

  app.use(((err, _req, res, _next) => {
    if (err instanceof tools.ToolError) return void res.status(err.status).json(err.body);
    console.error(err);
    res.status(err.status ?? 500).json({ error: err.status ? "bad_request" : "internal" });
  }) as ErrorRequestHandler);
  return app;
}
