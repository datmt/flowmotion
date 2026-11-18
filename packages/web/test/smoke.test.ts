import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { build } from "vite";
import { chromium, type Browser } from "playwright-core";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createApp } from "@flowmotion/server";
import { memoryStore } from "../../server/src/store.ts";

let browser: Browser, server: ReturnType<ReturnType<typeof createApp>["listen"]>, base: string;
const root = new URL("..", import.meta.url).pathname;

function chromiumPath() {
  const dir = `${homedir()}/.cache/ms-playwright`;
  const d = existsSync(dir) ? readdirSync(dir).filter((x) => x.startsWith("chromium-")).sort().at(-1) : undefined;
  return d ? `${dir}/${d}/chrome-linux64/chrome` : undefined; // ponytail: Linux path only; set CHROMIUM_PATH elsewhere
}

beforeAll(async () => {
  await build({ root, logLevel: "silent", build: { outDir: `${root}/dist`, emptyOutDir: true } });
  server = createApp({ store: memoryStore(), env: { PUBLIC_URL: "", WEB_DIST: `${root}/dist` } }).listen(0);
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? chromiumPath(), args: ["--no-sandbox"] });
}, 180_000);
afterAll(async () => { await browser?.close(); server?.close(); });

test("template published via API opens at /v/:id; → shows step 2 narration; library lists templates", async () => {
  const tpl = JSON.parse(readFileSync(new URL("../../../templates/binary-search.flow.json", import.meta.url), "utf8"));
  const { id } = await (await fetch(`${base}/api/share`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ doc: tpl }) })).json();
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}/v/${id}`);
  const narr = () => page.locator("flow-player .narr div").first().textContent();
  await page.locator("flow-player .narr div").first().waitFor({ timeout: 30_000 });
  const first = await narr();
  expect(first).toContain("mid = (0 + 9) / 2 = 4");

  await page.keyboard.press("Tab"); // focus the element, then →
  await page.locator("flow-player").focus();
  await page.keyboard.press("ArrowRight"); // plays step 1 (end of the current step)
  await page.waitForFunction(() => !(document.querySelector("flow-player") as any).player.playing, null, { timeout: 15_000 });
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => !(document.querySelector("flow-player") as any).player.playing, null, { timeout: 15_000 });
  expect(await narr()).not.toBe(first);
  expect(await page.locator("flow-player .now h2").textContent()).toMatch(/^2\//);

  await page.goto(`${base}/`);
  await expect.poll(() => page.getByText("Binary Search", { exact: false }).count()).toBeGreaterThan(0);
  expect(errors).toEqual([]);
}, 90_000);

test("F20 render page: identical pixels across loads; sheet mode within 1600px", async () => {
  const tpl = JSON.parse(readFileSync(new URL("../../../templates/binary-search.flow.json", import.meta.url), "utf8"));
  const { id } = await (await fetch(`${base}/api/share`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ doc: tpl }) })).json();
  const hashAt = async (qs: string, t: number) => {
    const page = await browser.newPage();
    try {
      await page.goto(`${base}/render/${id}?${qs}`);
      await page.waitForFunction(() => (window as any).__PLAYER__, null, { timeout: 30_000 });
      return await page.evaluate(async (t) => {
        const p = (window as any).__PLAYER__;
        await p.ready; await p.seek(t);
        const d = p.frame() as Uint8ClampedArray;
        const h = new Uint8Array(await crypto.subtle.digest("SHA-256", d as unknown as BufferSource));
        return { hash: [...h].join(","), len: d.length, nonBlank: d.some((v, i) => i % 4 < 3 && v !== d[0]), size: p.size };
      }, t);
    } finally { await page.close(); }
  };
  const a = await hashAt("mode=video&w=640&h=360&captions=1", 2.5), b = await hashAt("mode=video&w=640&h=360&captions=1", 2.5);
  expect(a.len).toBe(640 * 360 * 4);
  expect(a.nonBlank).toBe(true);
  expect(a.hash).toBe(b.hash);
  expect((await hashAt("mode=video&w=640&h=360&captions=1", 5)).hash).not.toBe(a.hash); // seek actually changes the frame
  const s = await hashAt("mode=sheet", 0);
  expect(Math.max(s.size.w, s.size.h)).toBeLessThanOrEqual(1600);
  expect(s.nonBlank).toBe(true);
}, 120_000);
