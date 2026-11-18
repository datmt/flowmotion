import { createApp } from "./app.ts";
import { storeFromEnv } from "./store.ts";

const env = process.env;
const port = Number(env.PORT ?? 3000);
createApp({ store: storeFromEnv(env), env }).listen(port, () => console.log(`flowmotion server on :${port}`));
