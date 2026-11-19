import { describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDsl } from "@flowmotion/core";

const run = (...a: string[]) => spawnSync("node", ["--experimental-strip-types", join(import.meta.dirname, "main.ts"), ...a], { encoding: "utf8" });
const dir = mkdtempSync(join(tmpdir(), "fm-"));
const good = join(import.meta.dirname, "../../../templates/security/oauth-pkce.flow");
const bad = join(dir, "bad.flow.json");
const doc = parseDsl(readFileSync(good, "utf8")).doc as any;
const first = doc.scenarios[0].steps[0];
(first.actions ??= []).push({ type: "highlight", targets: ["nope"] });
writeFileSync(bad, JSON.stringify(doc));

describe("flowmotion validate (.flow text)", () => {
  it("valid → 0; typo → exit 1 with line number", async () => {
    const text = readFileSync(good, "utf8");
    const ok = join(dir, "ok.flow"), ko = join(dir, "ko.flow");
    writeFileSync(ok, text);
    writeFileSync(ko, text.replace("\nnode ", "\nnod "));
    expect(run("validate", ok).status).toBe(0);
    const r = run("validate", ko);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/^error syntax line \d+: Unknown keyword 'nod'/m);
  });
});

describe("flowmotion validate", () => {
  it("valid → exit 0", () => expect(run("validate", good).status).toBe(0));
  it("invalid → exit 1 with issue line", () => {
    const r = run("validate", bad);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/^error /m);
  });
  it("--json prints array", () => {
    const r = run("validate", bad, "--json");
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout).some((i: { severity: string }) => i.severity === "error")).toBe(true);
  });
});

describe("flowmotion preview/render", () => {
  it("publishes a file, writes PNG and exported file via the API", async () => {
    const { createApp } = await import("../../server/src/app.ts");
    const { memoryStore } = await import("../../server/src/store.ts");
    const store = memoryStore();
    const job = { id: "j1", status: "done" as const, progress: 1, key: "exports/j1.mp4" };
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await store.put(job.key, Buffer.from("MP4DATA"));
    const server = createApp({ store, env: { PUBLIC_URL: "" }, renderer: { renderStill: async () => png, startExport: () => job, job: () => job } }).listen(0);
    try {
      const env = { ...process.env, FLOWMOTION_API_URL: `http://127.0.0.1:${(server.address() as { port: number }).port}` };
      const go = (...a: string[]) => new Promise<{ status: number | null; stdout: string; stderr: string }>((res) => {
        const p = spawn("node", ["--experimental-strip-types", join(import.meta.dirname, "main.ts"), ...a], { env });
        let stdout = "", stderr = ""; p.stdout.on("data", (d) => (stdout += d)); p.stderr.on("data", (d) => (stderr += d));
        p.on("close", (status) => res({ status, stdout, stderr }));
      });
      const o1 = join(dir, "p.png"), o2 = join(dir, "r.mp4");
      expect((await go("preview", good, "-o", o1)).status).toBe(0);
      expect(readFileSync(o1)).toEqual(png);
      expect((await go("render", good, "-o", o2)).status).toBe(0);
      expect(readFileSync(o2, "utf8")).toBe("MP4DATA");
    } finally { server.close(); }
  });
});
