import { createApp } from "./app.ts";
import { createWorker } from "@flowmotion/worker";
import { storeFromEnv } from "./store.ts";

const env = process.env;
const port = Number(env.PORT ?? 3000);
const store = storeFromEnv(env);
// The worker renders via this server's own render page, so it needs the listening port.
const worker = createWorker({ baseUrl: `http://127.0.0.1:${port}`, store });
createApp({ store, env, renderer: worker }).listen(port, () => console.log(`flowmotion server on :${port}`));
