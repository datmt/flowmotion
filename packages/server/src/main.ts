import pg from "pg";
import { createApp } from "./app.ts";
import { migrate } from "./db.ts";

const env = process.env;
const db = new pg.Pool({ connectionString: env.DATABASE_URL });
await migrate(db);
const port = Number(env.PORT ?? 3000);
createApp({ db, env }).listen(port, () => console.log(`flowmotion server on :${port}`));
