import { createHash, randomBytes } from "node:crypto";
import type { RequestHandler } from "express";
import type { Db } from "./db.ts";

export type Scope = "read" | "write" | "export";
export interface Auth { workspace: string; scopes: Scope[]; keyId: string }

const A = "abcdefghijklmnopqrstuvwxyz234567";
export function base32(b: Uint8Array): string {
  let bits = 0, v = 0, out = "";
  for (const x of b) {
    v = (v << 8) | x; bits += 8;
    while (bits >= 5) { out += A[(v >>> (bits - 5)) & 31]; bits -= 5; }
    v &= (1 << bits) - 1;
  }
  return bits ? out + A[(v << (5 - bits)) & 31] : out;
}
export const rid = (bytes: number) => base32(randomBytes(bytes));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Creates the workspace if missing; returns the key (shown once, only the hash is stored). */
export async function createKey(db: Db, workspace: string, scopes: Scope[] = ["read", "write", "export"]): Promise<string> {
  let ws = (await db.query("SELECT id FROM workspaces WHERE name = $1 LIMIT 1", [workspace])).rows[0]?.id;
  if (!ws) await db.query("INSERT INTO workspaces (id, name) VALUES ($1, $2)", [(ws = "w_" + rid(8)), workspace]);
  const key = "fm_" + rid(32);
  await db.query("INSERT INTO api_keys (id, workspace_id, hash, prefix, scopes) VALUES ($1,$2,$3,$4,$5)", ["k_" + rid(8), ws, sha(key), key.slice(0, 8), scopes]);
  return key;
}

// ponytail: fixed window per key, per process. Use a shared store if the server scales out.
const hits = new Map<string, { n: number; reset: number }>();

export const authenticate = (db: Db, limit = 120): RequestHandler => async (req, res, next) => {
  const m = /^Bearer (fm_\w+)$/.exec(req.header("authorization") ?? "");
  const row = m && (await db.query("SELECT id, workspace_id, scopes FROM api_keys WHERE hash = $1 AND revoked_at IS NULL", [sha(m[1]!)])).rows[0];
  if (!row) return void res.status(401).json({ error: "unauthorized", message: "Missing or invalid API key (Authorization: Bearer fm_…)." });
  const now = Date.now(), h = hits.get(row.id);
  const w = !h || h.reset < now ? { n: 0, reset: now + 60_000 } : h;
  hits.set(row.id, w);
  if (++w.n > limit) return void res.status(429).json({ error: "rate_limited" });
  res.locals.auth = { workspace: row.workspace_id, scopes: row.scopes, keyId: row.id } satisfies Auth;
  next();
};

export const need = (scope: Scope): RequestHandler => (req, res, next) =>
  (res.locals.auth as Auth).scopes.includes(scope) ? next() : void res.status(403).json({ error: "forbidden", message: `API key lacks the '${scope}' scope.` });
