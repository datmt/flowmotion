import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = (...a: string[]) => spawnSync("node", ["--experimental-strip-types", join(import.meta.dirname, "main.ts"), ...a], { encoding: "utf8" });
const dir = mkdtempSync(join(tmpdir(), "fm-"));
const good = join(import.meta.dirname, "../../../templates/oauth-pkce.flow.json");
const bad = join(dir, "bad.flow.json");
const doc = JSON.parse(readFileSync(good, "utf8"));
const first = doc.scenarios[0].steps[0];
(first.actions ??= []).push({ type: "highlight", targets: ["nope"] });
writeFileSync(bad, JSON.stringify(doc));

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
