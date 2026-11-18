// Gzip size of the element entry chunk (lazy chunks and fonts excluded) must stay ≤ 150 KB.
import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const dist = new URL("../dist/", import.meta.url);
const entry = readdirSync(dist).find((f) => f === "flow-player.js");
if (!entry) throw new Error("run `pnpm --filter @flowmotion/player build` first");
const kb = gzipSync(readFileSync(new URL(entry, dist))).length / 1024;
console.log(`flow-player.js gzip: ${kb.toFixed(1)} KB (limit 150)`);
if (kb > 150) process.exit(1);
