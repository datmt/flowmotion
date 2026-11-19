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

test("F27/F28 editor: drag pins, label + connect + delete are undoable and survive reload", async () => {
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${base}/`);
  await page.getByRole("listitem").filter({ hasText: "Circuit Breaker" }).getByRole("button", { name: "Use" }).click();
  await page.waitForURL(/\/local\//);
  await page.goto(page.url().replace("/local/", "/edit/"));
  await page.locator("[data-testid=canvas] canvas").first().waitFor({ timeout: 60_000 });
  const doc = () => page.evaluate(() => (window as any).__EDITOR__.store.get().doc);
  /** screen centre of a compiled entity (or the connect handle) */
  const at = (what: string) => page.evaluate((what) => {
    const e = (window as any).__EDITOR__, p = e.player, root = p.stage.getLayers().at(-1).children[0];
    const r = what === "handle" ? { x: root.children.at(-1).x() - 1, y: root.children.at(-1).y() - 1, w: 2, h: 2 } : [...p.compiled.nodes, ...p.compiled.arrays].find((n: any) => n.id === what).rect;
    const pt = root.getAbsoluteTransform().point({ x: r.x + r.w / 2, y: r.y + r.h / 2 }), b = p.stage.container().getBoundingClientRect();
    return { x: b.left + pt.x, y: b.top + pt.y };
  }, what);
  const drag = async (a: { x: number; y: number }, b: { x: number; y: number }) => {
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 }); await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up();
  };
  const ids = (await doc()).nodes.map((n: any) => n.id) as string[];
  const [n0, n1] = ids;

  const c0 = await at(n0!);
  await drag(c0, { x: c0.x + 140, y: c0.y + 90 });
  await expect.poll(async () => (await doc()).nodes[0].pos).toBeTruthy();

  await page.getByLabel("Label").fill("Renamed");
  await page.getByLabel("Label").press("Enter");
  await expect.poll(async () => (await doc()).nodes[0].label).toBe("Renamed");

  const edges = (await doc()).edges.length;
  const from = (await doc()).edges.some((e: any) => e.from === n0 && e.to === n1) ? ids[2]! : n1!;
  await page.waitForTimeout(500);
  await drag(await at("handle"), await at(from));
  await expect.poll(async () => (await doc()).edges.length).toBe(edges + 1);

  await page.waitForTimeout(600); // autosave
  await page.reload();
  await page.locator("[data-testid=canvas] canvas").first().waitFor({ timeout: 60_000 });
  expect((await doc()).nodes[0].label).toBe("Renamed");
  await page.getByRole("button", { name: "Undo" }).click(); // undoes the connect
  await expect.poll(async () => (await doc()).edges.length).toBe(edges);
  await page.getByRole("button", { name: "Undo" }).click(); // undoes the label
  await expect.poll(async () => (await doc()).nodes[0].label).not.toBe("Renamed");
  expect((await doc()).nodes[0].pos).toBeTruthy(); // pin survived
  await page.getByRole("button", { name: "Re-layout" }).click();
  await expect.poll(async () => (await doc()).nodes.some((n: any) => n.pos)).toBe(false);
  expect(errors).toEqual([]);
}, 120_000);

test("F29/F30 inspector + step editor: edit text, cells, narration, add/move/remove steps; all undoable", async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${base}/`);
  await page.getByRole("listitem").filter({ hasText: "Binary Search" }).getByRole("button", { name: "Use" }).click();
  await page.waitForURL(/\/local\//);
  await page.goto(page.url().replace("/local/", "/edit/"));
  await page.locator("[data-testid=canvas] canvas").first().waitFor({ timeout: 60_000 });
  const doc = () => page.evaluate(() => (window as any).__EDITOR__.store.get().doc);
  const arr = (await doc()).arrays[0];

  // flow title (nothing selected)
  await page.getByLabel("Title", { exact: true }).fill("My search");
  await page.getByLabel("Title", { exact: true }).press("Enter");
  await expect.poll(async () => (await doc()).meta.title).toBe("My search");

  // array values
  await page.evaluate((id) => (window as any).__EDITOR__.store.select(id), arr.id);
  await page.getByLabel("Values (one per line)").fill("9\n8\n7\n6\n5\n4\n3\n2\n1\n0");
  await page.getByLabel("Label", { exact: true }).focus(); // blur commits
  await expect.poll(async () => (await doc()).arrays[0].values[0]).toBe("9");

  // steps tab: narration, add step, move, remove
  await page.getByRole("tab", { name: "Steps" }).click();
  await page.getByLabel("Narration").fill("Edited narration");
  await page.getByLabel("Step title").focus();
  await expect.poll(async () => (await doc()).scenarios[0].steps[0].narration).toBe("Edited narration");
  const n = (await doc()).scenarios[0].steps.length;
  await page.getByRole("button", { name: "+ step" }).click();
  await expect.poll(async () => (await doc()).scenarios[0].steps.length).toBe(n + 1);
  const added = (await doc()).scenarios[0].steps[1].id;
  await page.getByRole("button", { name: "↑" }).click();
  await expect.poll(async () => (await doc()).scenarios[0].steps[0].id).toBe(added);
  await page.getByRole("button", { name: "remove", exact: true }).click();
  await expect.poll(async () => (await doc()).scenarios[0].steps.length).toBe(n);

  // too-long narration is rejected with a visible error, doc unchanged
  await page.getByLabel("Narration").fill("x".repeat(401));
  await page.getByLabel("Step title").focus();
  await expect.poll(() => page.getByRole("alert").count()).toBeGreaterThan(0);

  // undo everything back: remove, move, add, narration, values, title
  await page.getByLabel("Narration").fill("");
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Undo" }).click();
  const d = await doc();
  expect(d.meta.title).not.toBe("My search");
  expect(d.arrays[0].values[0]).not.toBe("9");
  expect(d.scenarios[0].steps[0].narration).not.toBe("Edited narration");
  expect(errors).toEqual([]);
}, 120_000);

test("F24 deep link, embed, standalone script, share card, remix", async () => {
  const tpl = JSON.parse(readFileSync(new URL("../../../templates/binary-search.flow.json", import.meta.url), "utf8"));
  const { id } = await (await fetch(`${base}/api/share`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ doc: tpl }) })).json();
  const sc = tpl.scenarios[0].id;
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // deep link opens on step 2; navigating rewrites the address bar
  await page.goto(`${base}/v/${id}?s=${sc}&step=1`);
  await expect.poll(() => page.locator("flow-player h2").textContent({ timeout: 30_000 })).toMatch(/^2\//);
  await page.locator("flow-player").focus();
  const settle = () => page.waitForFunction(() => !(document.querySelector("flow-player") as any).player.playing, null, { timeout: 15_000 });
  await page.keyboard.press("ArrowRight"); await settle(); // first press plays out the current step
  await page.keyboard.press("ArrowRight"); await settle();
  await expect.poll(() => new URL(page.url()).search).toBe(`?s=${sc}&step=2`);

  // embed dialog snippets
  await page.getByRole("button", { name: "Embed" }).click();
  expect(await page.getByLabel("iframe snippet").inputValue()).toContain(`/embed/${id}?s=${sc}&step=2`);
  expect(await page.getByLabel("<flow-player> snippet").inputValue()).toContain(`/flow-player.js`);

  // chrome-less embed
  await page.goto(`${base}/embed/${id}?s=${sc}&step=1`);
  await expect.poll(() => page.locator("flow-player h2").textContent({ timeout: 30_000 })).toMatch(/^2\//);
  expect(await page.getByText("Make your own").count()).toBe(0);

  // standalone script from another origin (CORS for script, fonts, snapshot)
  const third = await browser.newPage();
  await third.setContent(`<script src="${base}/flow-player.js"></script><flow-player src="${base}/api/share/${id}" step="1" style="height:500px"></flow-player>`);
  await expect.poll(() => third.locator("flow-player h2").textContent({ timeout: 30_000 })).toMatch(/^2\//);
  await third.close();

  // share card: og tags on /v/:id, none-breaking for unknown ids
  const html = await (await fetch(`${base}/v/${id}`)).text();
  expect(html).toContain(`<meta property="og:title" content="${tpl.meta.title}">`);
  expect((await fetch(`${base}/v/aaaaaaaaaaaa`)).status).toBe(200); // SPA shows not-found

  // remix copies the snapshot into the local library
  await page.goto(`${base}/v/${id}`);
  await page.getByRole("button", { name: "Remix" }).click();
  await page.waitForURL(/\/local\//);
  await expect.poll(() => page.getByRole("heading", { level: 1 }).textContent()).toBe(tpl.meta.title);
  expect(errors).toEqual([]);
}, 120_000);

test("F41 local icons: import in the editor, drawn locally; share falls back unless embedded", async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" onload="x()"><script>x()</script><path fill="#f00" d="M0 0H48V48H0Z"/></svg>';
  const doc = { version: "2.1", meta: { title: "Icons" }, nodes: [{ id: "a", label: "Store", kind: "db", icon: "local:mine" }, { id: "b", label: "API", kind: "service" }], edges: [{ from: "a", to: "b" }],
    scenarios: [{ id: "s", title: "s", steps: [{ id: "x", title: "x", narration: "n", actions: [] }] }] };
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}/`);
  await page.evaluate((doc) => new Promise<void>((res, rej) => {
    const o = indexedDB.open("flowmotion", 2);
    o.onsuccess = () => { const t = o.result.transaction("flows", "readwrite"); t.objectStore("flows").put({ id: "t1", doc, updated: Date.now() }); t.oncomplete = () => res(); t.onerror = () => rej(t.error); };
  }), doc);

  await page.goto(`${base}/edit/t1`);
  await page.getByLabel("Import SVG icons").setInputFiles({ name: "Arch_Mine_48.svg", mimeType: "image/svg+xml", buffer: Buffer.from(svg) });
  await page.getByText("Imported local:mine").waitFor({ timeout: 30_000 });

  await page.goto(`${base}/local/t1`);
  await page.locator("flow-player").waitFor();
  await page.waitForFunction(() => (document.querySelector("flow-player") as any)?.player?.compiled?.icons?.["local:mine"], null, { timeout: 30_000 });

  let last = "";
  const shared = async (embed: boolean) => {
    await page.getByRole("button", { name: "Share", exact: true }).first().click();
    const dlg = page.getByRole("dialog", { name: "Share options" });
    await dlg.waitFor();
    expect(await dlg.textContent()).toContain("local:mine");
    if (embed) await dlg.getByRole("checkbox").check();
    await dlg.getByRole("button", { name: "Share", exact: true }).click();
    await page.waitForFunction((l) => { const t = document.querySelector("[role=status]")?.textContent ?? ""; return t.includes("Link copied") && t !== l; }, last, { timeout: 30_000 });
    const msg = last = (await page.locator("[role=status]").textContent())!;
    const id = /\/v\/(\w+)/.exec(msg!)![1]!;
    return (await (await fetch(`${base}/api/share/${id}`)).json() as any).compiled.icons;
  };
  expect(await shared(false)).toBeUndefined(); // fallback glyph
  const icons = await shared(true);
  expect(icons["local:mine"].paths[0].fill).toBe("#f00");
  expect(JSON.stringify(icons)).not.toMatch(/script|onload/);
  expect(errors).toEqual([]);
  await page.close();
}, 120_000);

test("F44 icon picker: search packs, preview, pick sets the node icon", async () => {
  const doc = { version: "2.1", meta: { title: "Pick" }, nodes: [{ id: "a", label: "Store", kind: "db" }], edges: [],
    scenarios: [{ id: "s", title: "s", steps: [{ id: "x", title: "x", narration: "n", actions: [] }] }] };
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto(`${base}/`);
  await page.evaluate((doc) => new Promise<void>((res, rej) => {
    const o = indexedDB.open("flowmotion", 2);
    o.onsuccess = () => { const t = o.result.transaction("flows", "readwrite"); t.objectStore("flows").put({ id: "t2", doc, updated: Date.now() }); t.oncomplete = () => res(); t.onerror = () => rej(t.error); };
  }), doc);
  await page.goto(`${base}/edit/t2`);
  await page.waitForFunction(() => (window as any).__EDITOR__);
  await page.evaluate(() => (window as any).__EDITOR__.store.select("a"));
  await page.getByLabel("Search icons").fill("postgres");
  const hit = page.getByRole("listitem", { name: "si:postgresql" });
  await hit.waitFor({ timeout: 30_000 });
  expect(await hit.locator("svg path").count()).toBeGreaterThan(0); // preview drawn
  await hit.click();
  expect(await page.evaluate(() => (window as any).__EDITOR__.store.get().doc.nodes[0].icon)).toBe("si:postgresql");
  await page.getByLabel("Search icons").fill("zzzqqq");
  await page.getByText("No icons match").waitFor({ timeout: 30_000 });
  await page.close();
}, 120_000);
