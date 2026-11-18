import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { build } from "vite";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createApp } from "@flowmotion/server";
import { memoryStore } from "../../server/src/store.ts";
import { createWorker } from "../src/worker.ts";

const web = new URL("../../web/", import.meta.url).pathname;
const tpl = JSON.parse(readFileSync(new URL("../../../templates/binary-search.flow.json", import.meta.url), "utf8"));
const blobs = new Map<string, Uint8Array>();
let server: ReturnType<ReturnType<typeof createApp>["listen"]>, worker: ReturnType<typeof createWorker>;

beforeAll(async () => {
  await build({ root: web, logLevel: "silent", build: { outDir: `${web}dist`, emptyOutDir: true } });
  server = createApp({ store: memoryStore(), env: { PUBLIC_URL: "", WEB_DIST: `${web}dist` } }).listen(0);
  worker = createWorker({ baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}`, store: { put: async (k, b) => void blobs.set(k, b) } });
}, 180_000);
afterAll(async () => { await worker?.close(); server?.close(); });

test("still PNG: sheet and step", async () => {
  for (const png of [await worker.renderStill(tpl), await worker.renderStill(tpl, "main", 1)])
    expect([...png.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
}, 60_000);

test("export mp4 720p/30: ffprobe duration within 1 frame", async () => {
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const { id } = await (await fetch(`${base}/api/share`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ doc: tpl }) })).json();
  const steps = (await (await fetch(`${base}/api/share/${id}`)).json()).compiled.scenarios[0].steps;
  const expected = steps.at(-1).end;
  const job = worker.startExport(id, { format: "mp4", height: 720, fps: 30 });
  await worker.idle();
  expect(job.error).toBeUndefined();
  expect(job.status).toBe("done");
  expect(job.progress).toBe(1);
  const f = `${mkdtempSync(`${tmpdir()}/fm-t-`)}/o.mp4`;
  writeFileSync(f, blobs.get(job.key!)!);
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height,duration", "-of", "json", f]).toString()).streams[0];
  expect([probe.width, probe.height]).toEqual([1280, 720]);
  expect(Math.abs(+probe.duration - expected)).toBeLessThanOrEqual(1 / 30 + 1e-3);
}, 300_000);
