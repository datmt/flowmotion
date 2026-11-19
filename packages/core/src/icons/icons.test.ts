import { expect, test } from "vitest";
import { compile } from "../compile.ts";
import { parseDsl, printDsl } from "../dsl.ts";
import { localIconName, sanitizeSvg } from "./index.ts";
import { normalizeBody } from "./svg.ts";

const doc = (icon: string) => ({
  version: "2.1", meta: { title: "t" },
  nodes: [{ id: "a", label: "Postgres", kind: "db", icon }, { id: "b", label: "API", kind: "service", icon: "lucide:server" }],
  edges: [{ from: "a", to: "b" }],
  scenarios: [{ id: "s", title: "s", steps: [{ id: "x", title: "x", narration: "n", actions: [] }] }],
});

test("si:postgresql compiles with one icons entry per distinct ref; self-contained", async () => {
  const r = await compile(doc("si:postgresql"));
  expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
  expect(Object.keys(r.compiled!.icons!).sort()).toEqual(["lucide:server", "si:postgresql"]);
  expect(r.compiled!.icons!["si:postgresql"]).toMatchObject({ mono: true });
  expect(r.compiled!.nodes[0]!.icon).toBe("si:postgresql");
  expect(JSON.stringify(r.compiled)).not.toContain("<path"); // normalised: no raw SVG bodies
});

test("unknown icon: error with nearest names", async () => {
  const r = await compile(doc("si:postgre"));
  expect(r.compiled).toBeUndefined();
  expect(r.issues[0]).toMatchObject({ code: "unknown_icon", path: "/nodes/0/icon" });
  expect(r.issues[0]!.hint).toContain("si:postgresql");
  expect((await compile(doc("nope:x"))).issues[0]!.code).toBe("unknown_icon");
});

test("bad icon format fails the schema; local: passes and falls back", async () => {
  expect((await compile(doc("Postgres"))).issues[0]!.code).toBe("schema");
  const r = await compile(doc("local:mine"));
  expect(r.compiled!.icons).toMatchObject({ "lucide:server": expect.anything() });
  expect(r.compiled!.icons!["local:mine"]).toBeUndefined();
});

test("normalizeBody: groups, circles, rects", () => {
  const i = normalizeBody('<g fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><rect x="1" y="1" width="4" height="4"/><polyline points="1 2 3 4"/></g>');
  expect(i.paths).toHaveLength(3);
  expect(i.paths[0]).toMatchObject({ fill: "none", stroke: "currentColor", sw: 2 });
  expect(i.paths[2]!.d).toBe("M1 2L3 4");
  expect(i.mono).toBe(true);
  expect(normalizeBody('<path fill="#f00" d="M0 0"/>').mono).toBe(false);
});

test("DSL round-trips icon=", () => {
  const text = printDsl(doc("si:postgresql") as never);
  expect(text).toContain("icon=si:postgresql");
  expect(parseDsl(text).doc?.nodes[0]?.icon).toBe("si:postgresql");
});

test("carbon and devicon packs resolve", async () => {
  const { searchIcons } = await import("./index.ts");
  expect((await searchIcons("postgres", { pack: "devicon" })).map((h) => h.ref)).toContain("devicon:postgresql");
  expect((await searchIcons("load balancer", { pack: "carbon" })).length).toBeGreaterThan(0);
  const r = await compile(doc("devicon:postgresql"));
  expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
  expect(r.compiled!.icons!["devicon:postgresql"]!.mono).toBe(false);
});

const HOSTILE = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" onload="alert(1)">
<script>alert(1)</script><style>@import url(http://evil/x.css);</style>
<defs><linearGradient id="g"><stop offset="0" stop-color="#ff9900"/><stop offset="1" stop-color="#f00"/></linearGradient><path id="hid" d="M0 0"/></defs>
<foreignObject><div onclick="x()">hi</div></foreignObject><image href="http://evil/p.png"/><use href="#hid"/>
<g onclick="x()" fill="url(#g)"><path d="M0 0H48V48H0Z" onmouseover="x()" style="fill:red" fill="url(#g)"/>
<path d="M1 1javascript:alert(1)" fill="red"/><a href="javascript:x()"><rect x="1" y="2" width="3" height="4" stroke="url(http://evil/)"/></a></g></svg>`;

test("sanitizeSvg: hostile SVG becomes safe output (whitelist rebuild)", () => {
  const r = sanitizeSvg(HOSTILE);
  if ("error" in r) throw new Error(r.error);
  expect(r).toMatchObject({ w: 48, h: 48 });
  for (const bad of ["script", "style", "onload", "onclick", "onmouseover", "javascript", "http", "href", "foreignObject", "image", "use", "alert", "url("]) expect(r.body).not.toContain(bad);
  expect(r.body).toContain('fill="#ff9900"'); // gradient → first stop
  expect(r.body).toContain("<rect x=\"1\" y=\"2\" width=\"3\" height=\"4\"/>");
  expect(normalizeBody(r.body, r.w, r.h).paths.length).toBeGreaterThanOrEqual(2);
});

test("sanitizeSvg: rejects non-svg, oversize, origin-shifted viewBox, empty", () => {
  expect(sanitizeSvg("<html/>")).toHaveProperty("error");
  expect(sanitizeSvg(`<svg viewBox="0 0 1 1"><path d="${"M0 0".repeat(6000)}"/></svg>`)).toHaveProperty("error");
  expect(sanitizeSvg('<svg viewBox="5 5 10 10"><path d="M0 0"/></svg>')).toHaveProperty("error");
  expect(sanitizeSvg('<svg viewBox="0 0 10 10"><script>x</script></svg>')).toHaveProperty("error");
});

test("localIconName strips AWS-style prefix and size", () => {
  expect(localIconName("Arch_Amazon-Simple-Storage-Service_48.svg")).toBe("amazon-simple-storage-service");
  expect(localIconName("dir/My Logo.SVG")).toBe("my-logo");
  expect(localIconName("___.svg")).toBeUndefined();
});

test("local: icon resolves when supplied, warns and falls back when not", async () => {
  const icon = sanitizeSvg('<svg viewBox="0 0 24 24"><path fill="#f00" d="M0 0H24V24Z"/></svg>') as { body: string; w: number; h: number };
  const ok = await compile(doc("local:mine"), { localIcons: { "local:mine": icon } });
  expect(ok.compiled!.icons!["local:mine"]).toMatchObject({ mono: false });
  expect(ok.issues.some((i) => i.code === "icon_unresolved")).toBe(false);
  const no = await compile(doc("local:mine"));
  expect(no.compiled!.icons!["local:mine"]).toBeUndefined();
  expect(no.issues).toContainEqual(expect.objectContaining({ code: "icon_unresolved", severity: "warning" }));
});
