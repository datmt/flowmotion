import express from "express";
import type { Db } from "./db.ts";

export type Env = Record<string, string | undefined>;

export function createApp({ db }: { db: Db; env: Env }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb" })); // doc limit is 1 MB; ops/previews fit under 2
  app.get("/healthz", async (_req, res) => {
    await db.query("SELECT 1");
    res.json({ ok: true });
  });
  return app;
}
