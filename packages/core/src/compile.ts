import { createHighlighter, bundledLanguages, type Highlighter } from "shiki";
import { validate, type Issue } from "./validate.ts";
import { layout, type Layout } from "./layout.ts";
import { scheduleScenario } from "./timing.ts";
import { applySwap, applyValues, createCellSim, resolveCells, type CellSim } from "./cells.ts";
import { parseRef } from "./ref.ts";
import { aspects } from "./runtime/index.ts";
import type { FlowDoc } from "./schema.ts";
import type { CompiledFlow, CompiledScenario, Ease, Rect, Track, TrackProp } from "./runtime/index.ts";

const PAD = 40; // camera padding
const BLINK = 0.15; // transient edge-active ramp

let hl: Promise<Highlighter> | undefined;
const highlighter = () => (hl ??= createHighlighter({ themes: ["github-light", "github-dark"], langs: [] }));

export async function compile(input: unknown): Promise<{ compiled?: CompiledFlow; issues: Issue[] }> {
  const v = validate(input);
  if (!v.ok) return { issues: v.issues };
  const doc = v.doc, issues = [...v.issues];
  const lay = await layout(doc);
  const theme = doc.meta.theme ?? "light";

  // code: tokenise with shiki (compiler-side so the viewer never ships it)
  const code: CompiledFlow["code"] = [];
  for (const [i, c] of (doc.code ?? []).entries()) {
    const h = await highlighter();
    let lang = c.language;
    if (!(lang in bundledLanguages) && lang !== "text") {
      issues.push({ severity: "warning", code: "unknown_language", path: `/code/${i}/language`, where: `code › ${c.id}`, message: `Unknown language '${lang}'; rendering as plain text.` });
      lang = "text";
    }
    if (lang !== "text") await h.loadLanguage(lang as keyof typeof bundledLanguages);
    const { tokens } = h.codeToTokens(c.code, { lang: lang as "text", theme: theme === "dark" ? "github-dark" : "github-light" });
    const base = lay.code.find((x) => x.id === c.id)!;
    code.push({ id: c.id, ...(c.title ? { title: c.title } : {}), rect: base.rect, lines: tokens.map((l) => l.map((t) => ({ text: t.content, color: t.color ?? "" }))) });
  }

  const compiled: CompiledFlow = {
    version: "2.1",
    meta: { title: doc.meta.title, ...(doc.meta.summary ? { summary: doc.meta.summary } : {}), theme, aspect: doc.meta.aspect ?? "16:9" },
    bounds: lay.bounds,
    groups: lay.groups, nodes: lay.nodes, edges: lay.edges,
    arrays: lay.arrays, grids: lay.grids, code,
    tokens: (doc.tokens ?? []).map((t) => ({ id: t.id, ...(t.label ? { label: t.label } : {}) })),
    scenarios: doc.scenarios.map((s) => compileScenario(doc, lay, s.id)),
  };
  return { compiled, issues };
}

function compileScenario(doc: FlowDoc, lay: Layout, id: string): CompiledScenario {
  const sc = doc.scenarios.find((s) => s.id === id)!;
  const { steps: sched, duration } = scheduleScenario(doc, id);
  const sim = createCellSim(doc);
  const aspect = aspects[doc.meta.aspect ?? "16:9"];

  // — tracks —
  const tracks = new Map<string, Track>();
  const track = (target: string, prop: TrackProp, init: Track["init"]) => {
    const k = `${target}|${prop}`;
    let t = tracks.get(k);
    if (!t) tracks.set(k, (t = { target, prop, init, keys: [] }));
    return t;
  };
  const cur = (target: string, prop: TrackProp) => { const t = tracks.get(`${target}|${prop}`)!; return t.keys.length ? t.keys[t.keys.length - 1]!.to : t.init; };
  const key = (target: string, prop: TrackProp, t0: number, t1: number, ease: Ease, to: Track["init"]) => track(target, prop, to).keys.push({ t0, t1, ease, to });

  // cell instances (those present at start; later ones are added by `values`)
  const cells: { id: string; owner: string }[] = [];
  const addCell = (cid: string, owner: string, slot: number, value: string, visible: boolean) => {
    cells.push({ id: cid, owner });
    track(cid, "state", "idle"); track(cid, "visible", visible); track(cid, "label", value); track(cid, "slot", slot);
  };
  for (const [owner, o] of sim) o.order.forEach((cid, i) => addCell(cid, owner, i, o.values.get(cid)!, true));

  const hiddenOf = new Map<string, boolean>();
  doc.nodes.forEach((n) => { track(n.id, "state", n.state ?? "idle"); track(n.id, "visible", !n.hidden); track(n.id, "label", n.label); hiddenOf.set(n.id, !!n.hidden); });
  doc.edges.forEach((e) => { const eid = e.id ?? `${e.from}-${e.to}`; track(eid, "state", "idle"); track(eid, "visible", !e.hidden); track(eid, "label", e.label ?? ""); });
  doc.groups?.forEach((g) => { track(g.id, "state", "idle"); track(g.id, "visible", true); track(g.id, "label", g.label); });
  doc.arrays?.forEach((a) => track(a.id, "visible", !a.hidden));
  doc.grids?.forEach((g) => track(g.id, "visible", !g.hidden));
  doc.code?.forEach((c) => { track(c.id, "visible", !c.hidden); track(c.id, "lines", ""); });
  const tokenId = new Set<string>();
  doc.tokens?.forEach((t) => {
    tokenId.add(t.id);
    const p = parseRef(t.at)!;
    track(t.id, "visible", !t.hidden); track(t.id, "label", t.label ?? "");
    track(t.id, "at", { target: p.kind === "entity" ? t.at : resolveCells(sim, t.at)![0]! });
  });

  // — helpers —
  const kind = new Map<string, string>();
  [["group", doc.groups], ["node", doc.nodes], ["array", doc.arrays], ["grid", doc.grids], ["token", doc.tokens], ["code", doc.code]].forEach(([k, l]) => (l as { id: string }[] | undefined)?.forEach((e) => kind.set(e.id, k as string)));
  doc.edges.forEach((e) => kind.set(e.id ?? `${e.from}-${e.to}`, "edge"));

  /** Refs → target ids; whole arrays/grids expand to their cells when `expandCells`. */
  const targets = (refs: string[], expandCells = false): string[] =>
    refs.flatMap((r) => {
      const p = parseRef(r)!;
      if (p.kind !== "entity") return resolveCells(sim, r)!;
      return expandCells && (kind.get(r) === "array" || kind.get(r) === "grid") ? [...sim.get(r)!.order] : [r];
    });

  const slotOf = (cid: string) => { const o = sim.get(cid.slice(0, cid.indexOf("@")))!; return o.order.indexOf(cid); };
  const rectOf = (tid: string): Rect | undefined => {
    if (tid.includes("@")) {
      const owner = tid.slice(0, tid.indexOf("@"));
      return (lay.arrays.find((a) => a.id === owner) ?? lay.grids.find((g) => g.id === owner))?.slots[slotOf(tid)];
    }
    const e = lay.nodes.find((n) => n.id === tid) ?? lay.groups.find((g) => g.id === tid) ?? lay.arrays.find((a) => a.id === tid) ?? lay.grids.find((g) => g.id === tid) ?? lay.code.find((c) => c.id === tid);
    if (e) return e.rect;
    const ed = lay.edges.find((x) => x.id === tid);
    if (ed) {
      const xs = ed.points.filter((_, i) => i % 2 === 0), ys = ed.points.filter((_, i) => i % 2);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
    return undefined;
  };
  const ownerOf = (tid: string) => (tid.includes("@") ? tid.slice(0, tid.indexOf("@")) : tid);
  const fit = (rs: Rect[]): Rect => {
    const x0 = Math.min(...rs.map((r) => r.x)) - PAD, y0 = Math.min(...rs.map((r) => r.y)) - PAD;
    let w = Math.max(...rs.map((r) => r.x + r.w)) + PAD - x0, h = Math.max(...rs.map((r) => r.y + r.h)) + PAD - y0;
    let x = x0, y = y0;
    if (w / h < aspect) { const nw = h * aspect; x -= (nw - w) / 2; w = nw; } else { const nh = w / aspect; y -= (nh - h) / 2; h = nh; }
    return { x, y, w, h };
  };
  const findEdge = (from: string, to: string, via?: string): { id: string; reverse: boolean } => {
    if (via) { const e = doc.edges.find((x) => (x.id ?? `${x.from}-${x.to}`) === via)!; return { id: via, reverse: e.from !== from }; }
    const fwd = doc.edges.find((e) => e.from === from && e.to === to);
    const e = fwd ?? doc.edges.find((e) => e.from === to && e.to === from)!;
    return { id: e.id ?? `${e.from}-${e.to}`, reverse: !fwd };
  };

  const packets: CompiledScenario["packets"] = [], pulses: CompiledScenario["pulses"] = [], callouts: CompiledScenario["callouts"] = [], camera: CompiledScenario["camera"] = [];
  const entityIds = [...kind.keys()];

  // — actions —
  for (const st of sched) {
    for (const { action: a, t0, t1 } of st.actions) {
      const ease: Ease = a.ease ?? "inOut";
      switch (a.do) {
        case "state": for (const t of targets(a.targets, true)) key(t, "state", t0, t1, ease, a.state); break;
        case "show": case "hide": for (const t of targets(a.targets)) key(t, "visible", t0, t1, ease, a.do === "show"); break;
        case "label": for (const t of targets([a.target])) key(t, "label", t0, t1, ease, a.text); break;
        case "pulse": for (const t of targets(a.targets)) pulses.push({ target: t, t0, t1 }); break;
        case "callout": for (const t of targets([a.target])) callouts.push({ target: t, text: a.text, t0, t1: st.end }); break;
        case "highlight": key(a.target, "lines", t0, t1, ease, a.lines); break;
        case "focus": {
          const ts = targets(a.targets);
          const rs = ts.map(rectOf).filter((r): r is Rect => !!r);
          const inFocus = new Set(ts.map(ownerOf));
          camera.push({ t0, t1, ease, rect: rs.length ? fit(rs) : null, dim: a.dim && ts.length ? entityIds.filter((e) => !inFocus.has(e)) : [] });
          break;
        }
        case "send": {
          const e = findEdge(a.from, a.to, a.via);
          const prev = cur(e.id, "state");
          key(e.id, "state", t0, Math.min(t0 + BLINK, t1), "linear", "active");
          key(e.id, "state", t1, t1 + BLINK, "linear", prev);
          if (a.token) {
            key(a.token, "at", t0, t1, ease, { edge: e.id, reverse: e.reverse });
            key(a.token, "at", t1, t1, "linear", { target: a.to });
          } else packets.push({ edge: e.id, reverse: e.reverse, t0, t1, ease, ...(a.label ? { label: a.label } : {}) });
          break;
        }
        case "move": key(a.token, "at", t0, t1, ease, { target: targets([a.to])[0]! }); break;
        case "swap": {
          const [x, y] = [targets([a.a])[0]!, targets([a.b])[0]!];
          applySwap(sim, a.a, a.b);
          key(x, "slot", t0, t1, ease, slotOf(x)); key(y, "slot", t0, t1, ease, slotOf(y));
          break;
        }
        case "values": applyValuesTracks(sim, a.target, a.values, t0, t1, ease); break;
      }
    }
  }

  function applyValuesTracks(sim: CellSim, owner: string, values: string[], t0: number, t1: number, ease: Ease) {
    const keyed = !!doc.arrays?.find((x) => x.id === owner)?.keys;
    const before = new Map(sim.get(owner)!.values);
    const diff = applyValues(sim, owner, values)!;
    for (const k of diff.kept) {
      if (keyed) { if (before.get(k.id) !== values[k.slot]) key(k.id, "label", t0, t1, ease, values[k.slot]!); }
      else if (cur(k.id, "slot") !== k.slot) key(k.id, "slot", t0, t1, ease, k.slot);
    }
    for (const r of diff.removed) key(r, "visible", t0, t1, ease, false);
    for (const n of diff.added) { addCell(n.id, owner, n.slot, values[n.slot]!, false); key(n.id, "visible", t0, t1, ease, true); }
  }

  // — finalise tracks: sorted, non-overlapping —
  const out = [...tracks.values()].map((t) => {
    const ks = [...t.keys].sort((p, q) => p.t0 - q.t0);
    for (let i = 0; i + 1 < ks.length; i++) if (ks[i]!.t1 > ks[i + 1]!.t0) ks[i]!.t1 = Math.max(ks[i]!.t0, ks[i + 1]!.t0);
    return { ...t, keys: ks };
  });

  const stepsOut: CompiledScenario["steps"] = sched.map((s) => ({
    id: s.step.id, title: s.step.title, narration: s.step.narration, start: s.start, end: s.end, inherited: s.inherited,
    branches: doc.scenarios.filter((b) => b.id !== id && b.branchFrom?.scenario === s.scenario && b.branchFrom.afterStep === s.step.id).map((b) => ({ scenario: b.id, title: b.title })),
  }));
  return { id, title: sc.title, duration, steps: stepsOut, cells, tracks: out, packets, pulses, callouts, camera };
}
