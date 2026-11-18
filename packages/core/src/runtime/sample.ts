import type { StateName } from "../schema.ts";
import type { CompiledFlow, CompiledScenario, Rect, Track, TokenAt } from "./compiled.ts";
import { ease } from "./ease.ts";

export interface EntFrame {
  opacity: number;
  state: StateName; fromState: StateName; stateK: number; // color = mix(theme[fromState], theme[state], stateK)
  label?: string; fromLabel?: string; labelK?: number; // crossfade
  x?: number; y?: number; // centre of cells (slot interpolation) and tokens (from `at`)
}
export interface FrameState {
  t: number; step: number;
  ents: Map<string, EntFrame>;
  lines: Map<string, string>; // code block id → highlighted line spec
  packets: { x: number; y: number; label?: string; opacity: number }[];
  pulses: { target: string; k: number }[];
  callouts: { target: string; text: string; opacity: number }[];
  camera: { rect: Rect; dim: Set<string>; dimK: number };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Value of a track at t: previous value, target value, and eased progress k of the active key (1 when settled). */
function evalTrack(tr: Track, t: number, reduced: boolean) {
  const ks = tr.keys;
  let lo = 0, hi = ks.length; // last key with t0 <= t
  while (lo < hi) { const m = (lo + hi) >> 1; if (ks[m]!.t0 <= t) lo = m + 1; else hi = m; }
  if (!lo) return { from: tr.init, to: tr.init, k: 1 };
  const key = ks[lo - 1]!, from = lo > 1 ? ks[lo - 2]!.to : tr.init;
  const raw = key.t1 <= key.t0 ? 1 : clamp01((t - key.t0) / (key.t1 - key.t0));
  // ponytail: reducedMotion = jump at end of the key, not a true crossfade
  const k = reduced && (tr.prop === "slot" || tr.prop === "at") ? (raw >= 1 ? 1 : 0) : ease(key.ease, raw);
  return { from, to: key.to, k };
}

function pointOn(pts: number[], len: number, f: number) {
  let d = f * len;
  for (let i = 2; i < pts.length; i += 2) {
    const seg = Math.hypot(pts[i]! - pts[i - 2]!, pts[i + 1]! - pts[i - 1]!);
    if (d <= seg || i === pts.length - 2) {
      const k = seg ? Math.min(d / seg, 1) : 0;
      return { x: lerp(pts[i - 2]!, pts[i]!, k), y: lerp(pts[i - 1]!, pts[i + 1]!, k) };
    }
    d -= seg;
  }
  return { x: pts[0]!, y: pts[1]! };
}

/** Pure: the visual state at time t is a function of (compiled, scenario, t) only. */
export function sample(c: CompiledFlow, scenarioId: string, t: number, opts: { reducedMotion?: boolean } = {}): FrameState {
  const sc: CompiledScenario = c.scenarios.find((s) => s.id === scenarioId) ?? c.scenarios[0]!;
  const reduced = !!opts.reducedMotion;
  t = Math.min(Math.max(t, 0), sc.duration);

  const byTarget = new Map<string, Track[]>();
  for (const tr of sc.tracks) { let l = byTarget.get(tr.target); if (!l) byTarget.set(tr.target, (l = [])); l.push(tr); }

  const rects = new Map<string, Rect>();
  [...c.groups, ...c.nodes, ...c.arrays, ...c.grids, ...c.code].forEach((e) => rects.set(e.id, e.rect));
  const slotRect = new Map<string, Rect[]>();
  [...c.arrays, ...c.grids].forEach((o) => slotRect.set(o.id, o.slots));
  const edges = new Map(c.edges.map((e) => [e.id, e]));

  const ents = new Map<string, EntFrame>();
  const lines = new Map<string, string>();
  const ids = [...c.groups, ...c.nodes, ...c.edges, ...c.arrays, ...c.grids, ...c.code, ...c.tokens, ...sc.cells].map((e) => e.id);
  const cellPos = new Map<string, { x: number; y: number }>();

  for (const id of ids) {
    const f: EntFrame = { opacity: 1, state: "idle", fromState: "idle", stateK: 1 };
    for (const tr of byTarget.get(id) ?? []) {
      const v = evalTrack(tr, t, reduced);
      switch (tr.prop) {
        case "visible": f.opacity = lerp(v.from ? 1 : 0, v.to ? 1 : 0, v.k); break;
        case "state": f.state = v.to as StateName; f.fromState = v.from as StateName; f.stateK = v.k; break;
        case "label": f.label = v.to as string; f.fromLabel = v.from as string; f.labelK = v.k; break;
        case "lines": lines.set(id, v.to as string); break;
        case "slot": {
          const rs = slotRect.get(id.slice(0, id.indexOf("@")))!;
          const a = rs[v.from as number]!, b = rs[v.to as number]!;
          f.x = lerp(a.x + a.w / 2, b.x + b.w / 2, v.k); f.y = lerp(a.y + a.h / 2, b.y + b.h / 2, v.k);
          cellPos.set(id, { x: f.x, y: f.y });
          break;
        }
      }
    }
    ents.set(id, f);
  }

  // tokens ride on nodes, cells (already positioned) or edges
  const where = (a: TokenAt, k: number) => {
    if ("edge" in a) { const e = edges.get(a.edge)!; return pointOn(e.points, e.length, a.reverse ? 1 - k : k); }
    const r = rects.get(a.target);
    return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : cellPos.get(a.target) ?? { x: 0, y: 0 };
  };
  for (const tk of c.tokens) {
    const tr = byTarget.get(tk.id)?.find((x) => x.prop === "at");
    if (!tr) continue;
    const v = evalTrack(tr, t, reduced);
    const to = where(v.to as TokenAt, v.k), from = "edge" in (v.to as object) ? to : where(v.from as TokenAt, 1);
    const f = ents.get(tk.id)!;
    f.x = lerp(from.x, to.x, "edge" in (v.to as object) ? 1 : v.k); f.y = lerp(from.y, to.y, "edge" in (v.to as object) ? 1 : v.k);
  }

  const step = Math.max(0, sc.steps.findIndex((s) => t < s.end) < 0 ? sc.steps.length - 1 : sc.steps.findIndex((s) => t < s.end));

  const packets: FrameState["packets"] = [];
  if (!reduced)
    for (const p of sc.packets) {
      if (t < p.t0 || t > p.t1) continue;
      const e = edges.get(p.edge)!, f = ease(p.ease, (t - p.t0) / Math.max(p.t1 - p.t0, 1e-6));
      packets.push({ ...pointOn(e.points, e.length, p.reverse ? 1 - f : f), ...(p.label ? { label: p.label } : {}), opacity: clamp01(Math.min((t - p.t0) / 0.1, (p.t1 - t) / 0.1)) });
    }
  const pulses = reduced ? [] : sc.pulses.filter((p) => t >= p.t0 && t <= p.t1).map((p) => ({ target: p.target, k: Math.sin(Math.PI * clamp01((t - p.t0) / Math.max(p.t1 - p.t0, 1e-6))) }));
  const callouts = sc.callouts.filter((x) => t >= x.t0 && t < x.t1).map((x) => ({ target: x.target, text: x.text, opacity: clamp01((t - x.t0) / 0.2) }));

  // camera: last focus with t0 <= t, easing from the previous one (or the full view)
  const full = c.bounds;
  let ci = sc.camera.length;
  while (ci > 0 && sc.camera[ci - 1]!.t0 > t) ci--;
  let camera: FrameState["camera"] = { rect: full, dim: new Set(), dimK: 0 };
  if (ci) {
    const cur = sc.camera[ci - 1]!, prev = ci > 1 ? sc.camera[ci - 2]! : undefined;
    const k = cur.t1 <= cur.t0 ? 1 : ease(cur.ease, (t - cur.t0) / (cur.t1 - cur.t0));
    const a = prev?.rect ?? full, b = cur.rect ?? full;
    const dim = cur.dim.length ? cur.dim : prev?.dim ?? [];
    camera = {
      rect: { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k) },
      dim: new Set(dim), dimK: cur.dim.length ? k : dim.length ? 1 - k : 0,
    };
  }
  return { t, step, ents, lines, packets, pulses, callouts, camera };
}

/** Settled value of every track at the end of step `i` (what `sample` shows just before the next step starts). */
export function stateAt(c: CompiledFlow, scenarioId: string, i: number): Map<string, Partial<Record<Track["prop"], Track["init"]>>> {
  const sc = c.scenarios.find((s) => s.id === scenarioId) ?? c.scenarios[0]!;
  const t = (sc.steps[Math.min(i, sc.steps.length - 1)]?.end ?? 0) - 1e-6;
  const out = new Map<string, Partial<Record<Track["prop"], Track["init"]>>>();
  for (const tr of sc.tracks) { let m = out.get(tr.target); if (!m) out.set(tr.target, (m = {})); m[tr.prop] = evalTrack(tr, t, false).to; }
  return out;
}
