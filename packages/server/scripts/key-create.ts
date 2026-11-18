import { parseArgs } from "node:util";
import pg from "pg";
import { createKey, type Scope } from "../src/auth.ts";
import { migrate } from "../src/db.ts";

const { values } = parseArgs({ options: { workspace: { type: "string" }, scopes: { type: "string", default: "read,write,export" } } });
if (!values.workspace) throw new Error("usage: key:create --workspace <name> [--scopes read,write,export]");
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await migrate(db);
console.log(await createKey(db, values.workspace, values.scopes!.split(",") as Scope[]));
await db.end();
