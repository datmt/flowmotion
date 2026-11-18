import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { chromium, type Browser, type Page } from "playwright-core";

/** Render worker (PRD §8): one long-lived Chromium at DPR 1 drives the F20 render page; frames pipe to ffmpeg. */
export type Format = "mp4" | "webm" | "gif";
export interface ExportOpts { scenario?: string; format?: Format; height?: 720 | 1080; fps?: 30 | 60; captions?: boolean }
export interface Job { id: string; status: "queued" | "running" | "done" | "error"; progress: number; key?: string; error?: string }
type Sink = { put(key: string, body: Uint8Array, contentType?: string): Promise<void> };

const ARGS: Record<Format, string[]> = {
  mp4: ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart"],
  webm: ["-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p", "-b:v", "0", "-crf", "32"],
  // ponytail: palettegen+paletteuse in one filtergraph (stdin can't be read twice); fine for short clips.
  gif: ["-filter_complex", "split[a][b];[a]palettegen[p];[b][p]paletteuse"],
};
const MIME: Record<Format, string> = { mp4: "video/mp4", webm: "video/webm", gif: "image/gif" };

function chromiumPath() {
  const dir = `${homedir()}/.cache/ms-playwright`;
  const d = existsSync(dir) ? readdirSync(dir).filter((x) => x.startsWith("chromium-")).sort().at(-1) : undefined;
  return process.env.CHROMIUM_PATH ?? (d ? `${dir}/${d}/chrome-linux64/chrome` : undefined); // ponytail: Linux path only
}

export function createWorker({ baseUrl, store }: { baseUrl: string; store: Sink }) {
  let browser: Promise<Browser> | undefined;
  const jobs = new Map<string, Job>();
  let chain: Promise<unknown> = Promise.resolve(), seq = 0;

  /** doc → shared id via the public API; ids pass through. */
  async function shareId(src: string | object) {
    if (typeof src === "string") return src;
    const r = await fetch(`${baseUrl}/api/share`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ doc: src }) });
    if (!r.ok) throw new Error(`share: ${r.status} ${await r.text()}`);
    return ((await r.json()) as { id: string }).id;
  }
  async function open(qs: URLSearchParams, id: string): Promise<Page> {
    browser ??= chromium.launch({ executablePath: chromiumPath(), args: ["--no-sandbox"] });
    const page = await (await browser).newPage({ deviceScaleFactor: 1 });
    await page.goto(`${baseUrl}/render/${id}?${qs}`);
    await page.waitForFunction(() => (window as any).__PLAYER__, null, { timeout: 30_000 });
    await page.evaluate(() => (window as any).__PLAYER__.ready);
    return page;
  }

  /** PNG of a step's end frame, or a contact sheet when `step` is omitted. */
  async function renderStill(src: string | object, scenario?: string, step?: number): Promise<Buffer> {
    const qs = new URLSearchParams({ mode: step === undefined ? "sheet" : "still", captions: "1" });
    if (scenario) qs.set("s", scenario);
    if (step !== undefined) qs.set("step", String(step));
    const page = await open(qs, await shareId(src));
    try {
      return await page.locator(step === undefined ? "canvas" : ".konvajs-content").screenshot({ type: "png" });
    } finally { await page.close(); }
  }

  async function runExport(job: Job, src: string | object, o: ExportOpts) {
    const format = o.format ?? "mp4", fps = o.fps ?? 30, H = o.height ?? 720, W = H * 16 / 9;
    const qs = new URLSearchParams({ mode: "video", w: String(W), h: String(H), captions: o.captions === false ? "0" : "1" });
    if (o.scenario) qs.set("s", o.scenario);
    const page = await open(qs, await shareId(src));
    const dir = await mkdtemp(`${tmpdir()}/fm-export-`);
    try {
      const out = `${dir}/out.${format}`;
      const ff = spawn("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${W}x${H}`, "-r", String(fps), "-i", "-", ...ARGS[format], out], { stdio: ["pipe", "ignore", "pipe"] });
      let err = ""; ff.stderr.on("data", (d) => (err += d));
      const exited = new Promise<number>((res) => ff.on("close", res));
      const duration = await page.evaluate(() => (window as any).__PLAYER__.duration as number);
      const n = Math.max(1, Math.round(duration * fps));
      for (let i = 0; i < n; i++) {
        const b64 = await page.evaluate(async (t) => {
          const p = (window as any).__PLAYER__; await p.seek(t);
          const d = p.frame() as Uint8ClampedArray; let s = "";
          for (let j = 0; j < d.length; j += 0x8000) s += String.fromCharCode(...d.subarray(j, j + 0x8000));
          return btoa(s);
        }, Math.min(i / fps, duration));
        if (!ff.stdin.write(Buffer.from(b64, "base64"))) await new Promise((r) => ff.stdin.once("drain", r));
        job.progress = (i + 1) / n;
      }
      ff.stdin.end();
      if (await exited) throw new Error(`ffmpeg: ${err}`);
      job.key = `exports/${job.id}.${format}`;
      await store.put(job.key, await readFile(out), MIME[format]);
    } finally { await page.close(); await rm(dir, { recursive: true, force: true }); }
  }

  /** Queue an export; jobs run one at a time. ponytail: in-memory, lost on restart (PLAN §0.3). */
  function startExport(src: string | object, o: ExportOpts = {}): Job {
    const job: Job = { id: `j${++seq}`, status: "queued", progress: 0 };
    jobs.set(job.id, job);
    chain = chain.then(async () => {
      job.status = "running";
      try { await runExport(job, src, o); job.status = "done"; }
      catch (e) { job.status = "error"; job.error = String(e); }
    });
    return job;
  }

  return {
    renderStill, startExport, job: (id: string) => jobs.get(id),
    idle: () => chain,
    close: async () => { await chain; await (await browser)?.close(); },
  };
}
