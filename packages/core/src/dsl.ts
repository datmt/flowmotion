import { lev, validate, type Issue } from "./validate.ts";
import type { FlowDoc } from "./schema.ts";

/** Flow text DSL (docs/dsl-draft.md). Line-oriented; 2-space indent; one action per line. */
export interface DslIssue extends Issue { line?: number; col?: number }

type Tok = { s: string; q: boolean; col: number };
class DslError extends Error {
  col: number; hint: string | undefined; // no parameter properties: node strip-types can't run them
  constructor(m: string, col: number, hint?: string) { super(m); this.col = col; this.hint = hint; }
}

const ACTIONS = ["state", "show", "hide", "label", "pulse", "effect", "focus", "callout", "send", "move", "swap", "values", "highlight"];
const TOP = ["flow", "summary", "tags", "level", "source", "related", "theme", "aspect", "layout", "group", "node", "edge", "array", "grid", "token", "code", "scenario"];
const guess = (w: string, all: string[]) => { const b = all.map((x) => [x, lev(w, x)] as const).sort((p, q) => p[1] - q[1])[0]; return b && b[1] <= 2 ? `Did you mean '${b[0]}'?` : `Expected one of: ${all.join(", ")}.`; };

function tokenize(text: string, base: number): Tok[] {
  const out: Tok[] = [];
  for (let i = 0; i < text.length;) {
    if (text[i] === " ") { i++; continue; }
    const col = base + i + 1;
    if (text[i] === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      if (j >= text.length) throw new DslError("Unterminated string", col, 'Close the string with a matching " .');
      try { out.push({ s: JSON.parse(text.slice(i, j + 1)), q: true, col }); } catch { throw new DslError("Bad escape in string", col, 'Use \\" for a quote, \\\\ for a backslash, \\n for a newline.'); }
      i = j + 1;
    } else {
      let j = i; while (j < text.length && text[j] !== " ") j++;
      out.push({ s: text.slice(i, j), q: false, col }); i = j;
    }
  }
  return out;
}

const q = (s: string) => JSON.stringify(s);
const cell = (s: string) => (/^[^\s"]+$/.test(s) && s !== "=" ? s : q(s));
const list = (s: string) => s.split(",");

/** Consume `key=value` options and bare flags from tokens; unknown ones are errors. */
function opts(toks: Tok[], kv: string[], flags: string[]) {
  const o: Record<string, string> = {}, f = new Set<string>();
  for (const t of toks) {
    const i = t.q ? -1 : t.s.indexOf("=");
    if (i > 0 && kv.includes(t.s.slice(0, i))) o[t.s.slice(0, i)] = t.s.slice(i + 1);
    else if (!t.q && flags.includes(t.s)) f.add(t.s);
    else throw new DslError(`Unknown option '${t.s}'`, t.col, guess(t.s.split("=")[0]!, [...kv.map((k) => k + "="), ...flags]));
  }
  return { o, f };
}
const num = (s: string, col: number, what: string) => { const n = Number(s); if (s === "" || Number.isNaN(n)) throw new DslError(`'${s}' is not a number (${what})`, col); return n; };

const TIMING_KV = ["delay", "dur", "ease"], TIMING_FLAGS = ["with", "after"];
function timing(toks: Tok[], kv: string[] = [], flags: string[] = []) {
  const { o, f } = opts(toks, [...TIMING_KV, ...kv], [...TIMING_FLAGS, ...flags]);
  const col = toks[0]?.col ?? 1, a: Record<string, unknown> = {};
  if (f.has("with")) a.start = "with"; else if (f.has("after")) a.start = "after";
  if (o.delay !== undefined) a.delay = num(o.delay, col, "delay");
  if (o.dur !== undefined) a.dur = num(o.dur, col, "dur");
  if (o.ease !== undefined) a.ease = o.ease;
  return { a, o, f };
}

export function parseDsl(text: string): { doc?: FlowDoc; issues: DslIssue[] } {
  const doc: any = { version: "2.1", meta: {}, nodes: [], edges: [], scenarios: [] };
  const at = new Map<string, number>(), issues: DslIssue[] = [];
  let ctx: { kind: "grid" | "code" | "scenario"; o: any; p: string } | undefined, step: { o: any; p: string; narr: boolean } | undefined;
  let n = 0;
  const err = (e: DslError) => issues.push({ severity: "error", code: "syntax", path: "", where: `line ${n}`, message: e.message, ...(e.hint ? { hint: e.hint } : {}), line: n, col: e.col });
  const push = (key: string, o: unknown) => { const l = (doc[key] ??= []) as unknown[]; at.set(`/${key}/${l.length}`, n); l.push(o); return `/${key}/${l.length - 1}`; };

  for (const raw of text.split(/\r?\n/)) {
    n++;
    const body = raw.trimStart(), ind = raw.length - body.length;
    if (!body || (body[0] === "#" && !(ctx?.kind === "code"))) continue;
    try {
      if (/\t/.test(raw.slice(0, ind))) throw new DslError("Tabs are not allowed; indent with 2 spaces", 1);
      if (ind % 2) throw new DslError("Indent must be a multiple of 2 spaces", 1);
      if (ind === 2 && ctx?.kind === "code") { // raw code line: `| text`
        if (body[0] !== "|") throw new DslError("Code lines start with '|'", 3, "Write `| your code` (one space after the pipe is dropped).");
        const l = body.length > 1 && body[1] === " " ? body.slice(2) : body.slice(1);
        ctx.o.code = ctx.o.code === undefined ? l : ctx.o.code + "\n" + l;
        continue;
      }
      const toks = tokenize(body, ind), verb = toks[0]!, rest = toks.slice(1);
      const need = (i: number, what: string) => { const t = toks[i]; if (!t) throw new DslError(`Missing ${what}`, raw.length + 1); return t; };
      if (ind === 0) {
        ctx = undefined; step = undefined;
        switch (verb.s) {
          case "flow": doc.meta.title = need(1, "title").s; at.set("/meta", n); break;
          case "summary": doc.meta.summary = need(1, "text").s; break;
          case "tags": doc.meta.tags = rest.map((t) => t.s); break;
          case "related": doc.meta.related = rest.map((t) => t.s); break;
          case "level": doc.meta.level = need(1, "level").s; break;
          case "source": (doc.meta.sources ??= []).push(need(1, "url").s); break;
          case "theme": doc.meta.theme = need(1, "theme").s; break;
          case "aspect": doc.meta.aspect = need(1, "aspect").s; break;
          case "layout": { const { o } = opts(rest, ["algorithm", "direction", "edges"], []); doc.layout = o; at.set("/layout", n); break; }
          case "group": { const { o } = opts(toks.slice(3), ["tone"], []); push("groups", { id: need(1, "id").s, label: need(2, "label").s, ...(o.tone && { tone: o.tone }) }); break; }
          case "node": {
            const { o, f } = opts(toks.slice(4), ["in", "state", "pos", "icon", "tone"], ["hidden"]);
            push("nodes", { id: need(1, "id").s, label: need(2, "label").s, kind: need(3, "kind").s, ...(o.in && { group: o.in }), ...(o.icon && { icon: o.icon }), ...(o.state && { state: o.state }), ...(o.tone && { tone: o.tone }), ...(o.pos && { pos: pos(o.pos, verb.col) }), ...(f.has("hidden") && { hidden: true }) });
            break;
          }
          case "edge": {
            if (need(2, "'>'").s !== ">") throw new DslError("Expected '>' between the two ids", toks[2]!.col, "Write `edge a > b`.");
            const lab = toks[4]?.q ? toks[4] : undefined;
            const { o, f } = opts(toks.slice(lab ? 5 : 4), ["id"], ["hidden", "dashed", "arrow", "noarrow"]);
            push("edges", { ...(o.id && { id: o.id }), from: need(1, "from").s, to: need(3, "to").s, ...(lab && { label: lab.s }), ...(f.has("arrow") && { arrow: true }), ...(f.has("noarrow") && { arrow: false }), ...(f.has("dashed") && { dashed: true }), ...(f.has("hidden") && { hidden: true }) });
            break;
          }
          case "array": {
            const lab = toks[2]?.q ? toks[2] : undefined, eq = toks.findIndex((t) => !t.q && t.s === "=");
            const { o, f } = opts(toks.slice(lab ? 3 : 2, eq < 0 ? undefined : eq), ["keys", "orientation", "in", "pos"], ["hidden"]);
            push("arrays", { id: need(1, "id").s, ...(lab && { label: lab.s }), values: eq < 0 ? [] : toks.slice(eq + 1).map((t) => t.s), ...(o.keys && { keys: list(o.keys) }), ...(o.orientation && { orientation: o.orientation }), ...(o.in && { group: o.in }), ...(o.pos && { pos: pos(o.pos, verb.col) }), ...(f.has("hidden") && { hidden: true }) });
            break;
          }
          case "grid": {
            const lab = toks[2]?.q ? toks[2] : undefined;
            const { o, f } = opts(toks.slice(lab ? 3 : 2), ["in", "pos"], ["hidden"]);
            const g = { id: need(1, "id").s, ...(lab && { label: lab.s }), rows: [] as string[][], ...(o.in && { group: o.in }), ...(o.pos && { pos: pos(o.pos, verb.col) }), ...(f.has("hidden") && { hidden: true }) };
            ctx = { kind: "grid", o: g, p: push("grids", g) };
            break;
          }
          case "token": {
            const lab = toks[2]?.q ? toks[2] : undefined;
            const { o, f } = opts(toks.slice(lab ? 3 : 2), ["at"], ["hidden"]);
            if (!o.at) throw new DslError("token needs at=<ref>", verb.col, "Write `token lo \"lo\" at=nums#0`.");
            push("tokens", { id: need(1, "id").s, ...(lab && { label: lab.s }), at: o.at, ...(f.has("hidden") && { hidden: true }) });
            break;
          }
          case "code": {
            const title = toks[3]?.q ? toks[3] : undefined;
            const { o, f } = opts(toks.slice(title ? 4 : 3), ["pos"], ["hidden"]);
            const c = { id: need(1, "id").s, ...(title && { title: title.s }), language: need(2, "language").s, code: undefined as unknown as string, ...(o.pos && { pos: pos(o.pos, verb.col) }), ...(f.has("hidden") && { hidden: true }) };
            ctx = { kind: "code", o: c, p: push("code", c) };
            break;
          }
          case "scenario": {
            const { o } = opts(toks.slice(3), ["from"], []);
            const [sc, st] = (o.from ?? "").split("/");
            if (o.from && !st) throw new DslError("from= needs <scenario>/<step>", verb.col, "Write `from=happy/charge`.");
            const s = { id: need(1, "id").s, title: need(2, "title").s, ...(o.from && { branchFrom: { scenario: sc, afterStep: st } }), steps: [] as unknown[] };
            ctx = { kind: "scenario", o: s, p: push("scenarios", s) };
            break;
          }
          default: throw new DslError(`Unknown keyword '${verb.s}'`, verb.col, guess(verb.s, TOP));
        }
      } else if (ind === 2 && ctx?.kind === "grid") {
        const g = ctx.o;
        if (verb.s === "row") g.rows.push(rest.map((t) => t.s));
        else if (verb.s === "rowlabels") g.rowLabels = rest.map((t) => t.s);
        else if (verb.s === "collabels") g.colLabels = rest.map((t) => t.s);
        else throw new DslError(`Unknown grid line '${verb.s}'`, verb.col, guess(verb.s, ["row", "rowlabels", "collabels"]));
      } else if (ind === 2 && ctx?.kind === "scenario") {
        if (verb.s !== "step") throw new DslError(`Expected 'step', found '${verb.s}'`, verb.col, guess(verb.s, ["step"]));
        const { o } = opts(toks.slice(3), ["hold"], []);
        const st = { id: need(1, "id").s, title: need(2, "title").s, narration: undefined as unknown as string, actions: [] as unknown[], ...(o.hold !== undefined && { hold: num(o.hold, verb.col, "hold") }) };
        const sp = `${ctx.p}/steps/${ctx.o.steps.length}`;
        at.set(sp, n); ctx.o.steps.push(st); step = { o: st, p: sp, narr: false };
      } else if (ind === 4 && step) {
        if (!step.narr) {
          if (!verb.q) throw new DslError("Step needs a quoted narration line first", verb.col, 'Put `"narration text"` right under the step line.');
          step.o.narration = verb.s; step.narr = true; at.set(`${step.p}/narration`, n);
        } else {
          at.set(`${step.p}/actions/${step.o.actions.length}`, n);
          step.o.actions.push(action(toks, raw.length));
        }
      } else throw new DslError("Unexpected indentation here", ind + 1, ind === 0 ? undefined : "Indent only under grid, code, scenario and step lines.");
    } catch (e) { if (e instanceof DslError) err(e); else throw e; }
  }
  if (!doc.meta.title && !issues.length) issues.push({ severity: "error", code: "syntax", path: "", where: "line 1", message: "Missing 'flow \"title\"' line", line: 1, col: 1 });
  if (issues.some((i) => i.severity === "error")) return { issues };

  const v = validate(doc);
  const line = (path: string) => { let p = path; while (p && !at.has(p)) p = p.slice(0, p.lastIndexOf("/")); return at.get(p); };
  const all: DslIssue[] = v.issues.map((i) => ({ ...i, line: line(i.path) }));
  return v.ok ? { doc: v.doc, issues: all } : { issues: all };
}

function pos(s: string, col: number) { const [x, y] = s.split(","); return { x: num(x!, col, "pos x"), y: num(y ?? "", col, "pos y") }; }

function action(toks: Tok[], eol: number): Record<string, unknown> {
  const verb = toks[0]!;
  const at = (i: number, what: string) => { const t = toks[i]; if (!t) throw new DslError(`Missing ${what}`, eol + 1); return t; };
  const eq = toks.findIndex((t) => !t.q && t.s === "=");
  switch (verb.s) {
    case "state": return { do: "state", targets: list(at(1, "targets").s), state: at(2, "state").s, ...timing(toks.slice(3)).a };
    case "show": case "hide": case "pulse": return { do: verb.s, targets: list(at(1, "targets").s), ...timing(toks.slice(2)).a };
    case "effect": return { do: "effect", targets: list(at(1, "targets").s), name: at(2, "effect name").s, ...timing(toks.slice(3)).a };
    case "focus": {
      const hasT = toks[1] && !toks[1].q && !/^(dim|with|after)$|=/.test(toks[1].s);
      const { a, f } = timing(toks.slice(hasT ? 2 : 1), [], ["dim"]);
      return { do: "focus", targets: hasT ? list(toks[1]!.s) : [], ...(f.has("dim") && { dim: true }), ...a };
    }
    case "label": case "callout": return { do: verb.s, target: at(1, "target").s, text: at(2, "text").s, ...timing(toks.slice(3)).a };
    case "send": {
      if (at(2, "'>'").s !== ">") throw new DslError("Expected '>' between the two ids", toks[2]!.col, "Write `send a > b \"label\"`.");
      const lab = toks[4]?.q ? toks[4] : undefined;
      const { a, o } = timing(toks.slice(lab ? 5 : 4), ["via", "token"]);
      return { do: "send", from: at(1, "from").s, to: at(3, "to").s, ...(o.via && { via: o.via }), ...(lab && { label: lab.s }), ...(o.token && { token: o.token }), ...a };
    }
    case "move":
      if (at(2, "'to'").s !== "to") throw new DslError("Expected 'to'", toks[2]!.col, "Write `move lo to nums#5`.");
      return { do: "move", token: at(1, "token").s, to: at(3, "target").s, ...timing(toks.slice(4)).a };
    case "swap": return { do: "swap", a: at(1, "first ref").s, b: at(2, "second ref").s, ...timing(toks.slice(3)).a };
    case "values": return { do: "values", target: at(1, "target").s, values: eq < 0 ? [] : toks.slice(eq + 1).map((t) => t.s), ...timing(toks.slice(2, eq < 0 ? undefined : eq)).a };
    case "highlight": return { do: "highlight", target: at(1, "target").s, lines: at(2, "line spec").s, ...timing(toks.slice(3)).a };
    default: throw new DslError(`Unknown action '${verb.s}'`, verb.col, guess(verb.s, ACTIONS));
  }
}

export function printDsl(doc: FlowDoc): string {
  const L: string[] = [`flow ${q(doc.meta.title)}`];
  if (doc.meta.summary) L.push(`summary ${q(doc.meta.summary)}`);
  if (doc.meta.tags) L.push(`tags ${doc.meta.tags.join(" ")}`);
  if (doc.meta.level) L.push(`level ${doc.meta.level}`);
  for (const u of doc.meta.sources ?? []) L.push(`source ${q(u)}`);
  if (doc.meta.related) L.push(`related ${doc.meta.related.join(" ")}`);
  if (doc.meta.theme) L.push(`theme ${doc.meta.theme}`);
  if (doc.meta.aspect) L.push(`aspect ${doc.meta.aspect}`);
  if (doc.layout) L.push(`layout${doc.layout.algorithm ? ` algorithm=${doc.layout.algorithm}` : ""}${doc.layout.direction ? ` direction=${doc.layout.direction}` : ""}${doc.layout.edges ? ` edges=${doc.layout.edges}` : ""}`);
  const px = (p?: { x: number; y: number }) => (p ? ` pos=${p.x},${p.y}` : "");
  const join = (...p: (string | false | undefined)[]) => p.filter(Boolean).join(" ");
  L.push("");
  for (const g of doc.groups ?? []) L.push(join("group", g.id, q(g.label), g.tone && `tone=${g.tone}`));
  for (const x of doc.nodes) L.push(join("node", x.id, q(x.label), x.kind, x.group && `in=${x.group}`, x.icon && `icon=${x.icon}`, x.state && `state=${x.state}`, x.tone && `tone=${x.tone}`, x.pos && px(x.pos).trim(), x.hidden && "hidden"));
  for (const e of doc.edges) L.push(join("edge", e.from, ">", e.to, e.label !== undefined && q(e.label), e.id && `id=${e.id}`, e.arrow === true && "arrow", e.arrow === false && "noarrow", e.dashed && "dashed", e.hidden && "hidden"));
  for (const a of doc.arrays ?? []) L.push(join("array", a.id, a.label !== undefined && q(a.label), a.keys && `keys=${a.keys.join(",")}`, a.orientation && `orientation=${a.orientation}`, a.group && `in=${a.group}`, a.pos && px(a.pos).trim(), a.hidden && "hidden", "=", ...a.values.map(cell)));
  for (const g of doc.grids ?? []) {
    L.push(join("grid", g.id, g.label !== undefined && q(g.label), g.group && `in=${g.group}`, g.pos && px(g.pos).trim(), g.hidden && "hidden"));
    if (g.rowLabels) L.push("  " + join("rowlabels", ...g.rowLabels.map(cell)));
    if (g.colLabels) L.push("  " + join("collabels", ...g.colLabels.map(cell)));
    for (const r of g.rows) L.push("  " + join("row", ...r.map(cell)));
  }
  for (const t of doc.tokens ?? []) L.push(join("token", t.id, t.label !== undefined && q(t.label), `at=${t.at}`, t.hidden && "hidden"));
  for (const c of doc.code ?? []) {
    L.push(join("code", c.id, c.language, c.title !== undefined && q(c.title), c.pos && px(c.pos).trim(), c.hidden && "hidden"));
    for (const l of c.code.split("\n")) L.push(l ? `  | ${l}` : "  |");
  }
  for (const s of doc.scenarios) {
    L.push("", join("scenario", s.id, q(s.title), s.branchFrom && `from=${s.branchFrom.scenario}/${s.branchFrom.afterStep}`));
    for (const st of s.steps) {
      L.push(join("  step", st.id, q(st.title), st.hold !== undefined && `hold=${st.hold}`), `    ${q(st.narration)}`);
      for (const a of st.actions) L.push("    " + actionLine(a));
    }
  }
  return L.join("\n") + "\n";
}

function actionLine(a: FlowDoc["scenarios"][number]["steps"][number]["actions"][number]): string {
  const t = [a.start, a.delay !== undefined && `delay=${a.delay}`, a.dur !== undefined && `dur=${a.dur}`, a.ease && `ease=${a.ease}`];
  const j = (...p: (string | false | undefined)[]) => p.filter(Boolean).join(" ");
  switch (a.do) {
    case "state": return j("state", a.targets.join(","), a.state, ...t);
    case "show": case "hide": case "pulse": return j(a.do, a.targets.join(","), ...t);
    case "effect": return j("effect", a.targets.join(","), a.name, ...t);
    case "focus": return j("focus", a.targets.join(","), a.dim && "dim", ...t);
    case "label": case "callout": return j(a.do, a.target, q(a.text), ...t);
    case "send": return j("send", a.from, ">", a.to, a.label !== undefined && q(a.label), a.via && `via=${a.via}`, a.token && `token=${a.token}`, ...t);
    case "move": return j("move", a.token, "to", a.to, ...t);
    case "swap": return j("swap", a.a, a.b, ...t);
    case "values": return j("values", a.target, ...t, "=", ...a.values.map(cell));
    case "highlight": return j("highlight", a.target, q(a.lines), ...t);
  }
}
