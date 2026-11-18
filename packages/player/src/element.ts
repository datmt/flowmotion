import { stateAt, type CompiledFlow } from "@flowmotion/core/runtime";
import { createPlayer, type Player } from "./player.ts";

const fonts: [string, string, string][] = [
  ["Inter", "400", new URL("../../../assets/fonts/inter-latin-400-normal.woff2", import.meta.url).href],
  ["Inter", "700", new URL("../../../assets/fonts/inter-latin-700-normal.woff2", import.meta.url).href],
  ["JetBrains Mono", "400", new URL("../../../assets/fonts/jetbrains-mono-latin-400-normal.woff2", import.meta.url).href],
];
let fontsReady: Promise<unknown> | undefined;
const loadFonts = () => (fontsReady ??= Promise.all(fonts.map(async ([family, weight, url]) => {
  const f = new FontFace(family, `url(${url})`, { weight });
  (document.fonts as unknown as Set<FontFace>).add(await f.load());
})));

const CSS = `
:host{display:block;font:14px/1.45 Inter,system-ui,sans-serif;color:var(--fg);--fg:#1f2937;--bg:#fff;--line:#d1d5db;--accent:#2563eb;--chg:#fef3c7}
:host([theme=dark]){--fg:#e2e8f0;--bg:#0f172a;--line:#334155;--accent:#60a5fa;--chg:#4a3b0a}
*{box-sizing:border-box}
.wrap{background:var(--bg);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:grid;grid-template-columns:var(--rw,200px) minmax(0,1fr) var(--nw,300px);min-height:360px;position:relative}
.grip{position:absolute;top:0;bottom:0;width:7px;margin-left:-3px;cursor:col-resize;z-index:5;touch-action:none}.grip:hover,.grip.on{background:color-mix(in srgb,var(--accent) 40%,transparent)}
.rail{border-right:1px solid var(--line);padding:8px;overflow:auto;max-height:640px}
.rail>summary{display:none;cursor:pointer;font-weight:700}
ol.steps{list-style:none;margin:0;padding:0 0 0 12px;border-left:2px solid var(--line)}
ol.steps li{position:relative;margin:2px 0}
ol.steps li::before{content:"";position:absolute;left:-18px;top:.6em;width:8px;height:8px;border-radius:50%;background:var(--line)}
ol.steps li[data-s=done]::before{background:var(--accent)} ol.steps li[data-s=current]::before{background:var(--bg);border:2px solid var(--accent)}
ol.steps li[data-s=current]>button{font-weight:700;color:var(--accent)} ol.steps li[data-s=upcoming]>button{opacity:.7}
ol.steps button{border:0;padding:2px 4px;text-align:left;width:100%}
.branches{margin:2px 0 4px 6px;padding-left:8px;border-left:2px dashed var(--accent)}.branches>summary{color:var(--accent);font-size:12px;font-weight:600;cursor:pointer;padding:2px 0}.branches:not([open])>summary::after{content:" (click to expand)";font-weight:400;opacity:.6}.branches ol.steps{border-left:0;padding-left:12px}
.center{position:relative;min-width:0}.stage{width:100%}
.ctl{display:flex;gap:6px;align-items:center;justify-content:center;flex-wrap:wrap;padding:6px 10px;border-bottom:1px solid var(--line);background:var(--bg)}.ctl .sep{width:1px;align-self:stretch;background:var(--line);margin:0 4px}
.more{position:relative}.more summary{cursor:pointer;list-style:none;padding:2px 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg)}
.more div{position:absolute;right:0;top:100%;z-index:6;display:flex;flex-direction:column;gap:6px;margin-top:4px;padding:8px;background:var(--bg);border:1px solid var(--line);border-radius:6px}
.now{border-left:1px solid var(--line);padding:12px 16px;overflow:auto;max-height:640px}
.now h2{margin:0 0 6px;font-size:20px;line-height:1.25}
.narr{font-size:15px;line-height:1.55}
.narr code{font-family:'JetBrains Mono',monospace;background:color-mix(in srgb,var(--fg) 10%,transparent);padding:0 .25em;border-radius:3px}
.now h3{margin:14px 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.65}
.now ul{margin:0;padding-left:18px}.now li code{font-family:'JetBrains Mono',monospace;font-size:12px}
table.state{border-collapse:collapse;margin-bottom:8px;font-family:'JetBrains Mono',monospace;font-size:12px}
table.state caption{text-align:left;font:600 12px Inter,sans-serif;padding-bottom:2px}
table.state td,table.state th{border:1px solid var(--line);padding:1px 6px;text-align:center;font-weight:400}
table.state th{opacity:.65;font-size:10px}.state .chg{background:var(--chg);font-weight:700}.state .off{opacity:.4}
button,select{font:inherit;color:inherit;background:transparent;border:1px solid var(--line);border-radius:6px;padding:4px 10px;cursor:pointer}
button:hover{border-color:var(--accent)} button:focus-visible,select:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--accent)}
input[type=range]{accent-color:var(--accent)}
:host([fill]){height:100%}:host([fill]) .wrap{height:100%;min-height:0;grid-template-rows:minmax(0,1fr)}:host([fill]) .center{min-height:0}
:host([fill]) .rail,:host([fill]) .now{max-height:none}
.strip{display:flex;gap:2px;padding:8px 10px;border-top:1px solid var(--line);background:var(--bg);overflow-x:auto}
.strip button{flex:1 0 64px;display:flex;flex-direction:column;align-items:center;gap:3px;border:0;font-size:11px;line-height:1.2;text-align:center;opacity:.6}
.strip b{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;border:1.5px solid var(--line);font-size:11px}
.strip [data-s=done]{opacity:1}.strip [data-s=done] b{background:var(--accent);border-color:var(--accent);color:var(--bg)}
.strip [data-s=current]{opacity:1;font-weight:700}.strip [data-s=current] b{border-color:var(--accent);color:var(--accent)}
:host([fill]) .stage{flex:1;min-height:0;aspect-ratio:auto!important;overflow:hidden}:host([fill]) .center{display:flex;flex-direction:column;background:radial-gradient(circle at 1px 1px,color-mix(in srgb,var(--fg) 12%,transparent) 1px,transparent 0) 0 0/18px 18px}
.hint{margin:10px 0 0;padding:8px 10px;border:1px dashed var(--accent);border-radius:8px;font-size:13px}.hint:empty{display:none}.hint p{margin:0 0 6px}.hint button{display:block;width:100%;text-align:left;margin-top:4px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:720px){
  .wrap{grid-template-columns:minmax(0,1fr)}.center{order:1}.now{order:2;border-left:0;border-top:1px solid var(--line);max-height:none}
  .grip{display:none}.wrap{grid-template-columns:minmax(0,1fr)!important}
  .rail{order:3;border-right:0;border-top:1px solid var(--line);max-height:none}.rail>summary{display:block}
}
`;

/** `**bold**` and `` `code` `` → DOM via textContent only (never innerHTML). */
function fmt(into: HTMLElement, s: string) {
  into.replaceChildren();
  for (const part of s.split(/(`[^`]+`|\*\*[^*]+\*\*)/)) {
    if (!part) continue;
    const el = part.startsWith("`") ? document.createElement("code") : part.startsWith("**") ? document.createElement("strong") : null;
    if (el) { el.textContent = part.replace(/^(`|\*\*)|(`|\*\*)$/g, ""); into.append(el); } else into.append(part);
  }
}
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, ...kids: (Node | string)[]) => {
  const e = document.createElement(tag); const { class: cls, ...rest } = props as { class?: string };
  if (cls) e.className = cls;
  Object.assign(e, rest); e.append(...kids); return e;
};

export class FlowPlayerElement extends HTMLElement {
  player?: Player;
  ready: Promise<Player>;
  #resolve!: (p: Player) => void;
  #ro?: ResizeObserver;
  constructor() { super(); this.ready = new Promise((r) => (this.#resolve = r)); }

  connectedCallback() { void this.#boot(); }
  disconnectedCallback() { this.#ro?.disconnect(); this.player?.destroy(); }

  async #boot() {
    const src = this.getAttribute("src");
    if (!src) return;
    const root = this.attachShadow({ mode: "open" });
    root.append(h("style", { textContent: CSS }));
    const [compiled] = await Promise.all([this.#load(src), loadFonts()]);
    this.setAttribute("theme", compiled.meta.theme);
    this.#build(root, compiled);
  }

  async #load(src: string): Promise<CompiledFlow> {
    const json = await (await fetch(src)).json();
    if (json.compiled) return json.compiled; // shared snapshot {doc, compiled}
    if (json.scenarios?.[0]?.tracks) return json; // already compiled
    const { compile } = await import("@flowmotion/core"); // lazy: keeps zod/elk/shiki out of the embed bundle
    const r = await compile(json);
    if (!r.compiled) throw new Error(r.issues.map((i) => `${i.code}: ${i.message}`).join("\n"));
    return r.compiled;
  }

  #build(root: ShadowRoot, c: CompiledFlow) {
    const stageEl = h("div", { class: "stage" });
    stageEl.style.aspectRatio = c.meta.aspect.replace(":", "/");
    const stateH = h("h3", { textContent: "State" }), title = h("h2"), body = h("div"), changes = h("ul"), state = h("div");
    const narr = h("div", { class: "narr", ariaLive: "polite" } as object, body);
    const playBtn = h("button", { class: "play", textContent: "▶", ariaLabel: "Play" } as object);
    const prev = h("button", { class: "prev", textContent: "◀", ariaLabel: "Previous step" } as object);
    const next = h("button", { class: "next", textContent: "▶▶", ariaLabel: "Next step" } as object);
    const scrub = h("input", { type: "range", min: "0", max: "1000", value: "0", ariaLabel: "Seek" } as object) as HTMLInputElement;
    const speed = h("select", { ariaLabel: "Speed" } as object, ...["0.5", "1", "1.5", "2"].map((v) => h("option", { value: v, textContent: `${v}×`, selected: v === "1" }))) as HTMLSelectElement;
    const zin = h("button", { textContent: "+", ariaLabel: "Zoom in", title: "Zoom in (or scroll)" } as object), zout = h("button", { textContent: "−", ariaLabel: "Zoom out", title: "Zoom out" } as object), zfit = h("button", { textContent: "Fit", ariaLabel: "Reset zoom", title: "Reset zoom and pan" } as object);
    const more = h("details", { class: "more" }, h("summary", { textContent: "⋯", ariaLabel: "More controls" } as object), h("div", {}, speed, scrub));
    const steps = h("ol", { class: "steps", ariaLabel: "Steps" } as object);
    const rail = h("details", { class: "rail" }, h("summary", { textContent: "Steps" }), steps);
    const strip = h("div", { class: "strip" });
    const narrow = matchMedia("(max-width:720px)");
    rail.open = !narrow.matches; narrow.onchange = () => (rail.open = !narrow.matches);
    const hint = h("div", { class: "hint" });
    const now = h("div", { class: "now" }, title, narr, hint, h("h3", { textContent: "What changed" }), changes, stateH, state);
    const tables = h("div", { class: "sr" });
    // drag a column edge to resize rail / right panel
    const grip = (v: string, dir: 1 | -1, panel: HTMLElement) => {
      const g = h("div", { class: "grip", role: "separator", ariaOrientation: "vertical" } as object);
      const place = () => { const w = panel.offsetWidth; g.style.left = dir > 0 ? `${w}px` : `calc(100% - ${w}px)`; };
      new ResizeObserver(place).observe(panel);
      g.onpointerdown = (ev) => {
        g.setPointerCapture(ev.pointerId); g.classList.add("on");
        const x0 = ev.clientX, w0 = panel.offsetWidth;
        g.onpointermove = (m) => { this.style.setProperty(v, `${Math.min(600, Math.max(120, w0 + dir * (m.clientX - x0)))}px`); p?.resize(); };
        g.onpointerup = () => { g.classList.remove("on"); g.onpointermove = g.onpointerup = null; };
      };
      return g;
    };
    root.append(h("div", { class: "wrap" }, rail, h("div", { class: "center" }, h("div", { class: "ctl" }, prev, playBtn, next, h("span", { class: "sep" }), zout, zfit, zin, h("span", { class: "sep" }), more), stageEl, strip), now, grip("--rw", 1, rail), grip("--nw", -1, now)), tables);

    const keysOf = new Map(c.arrays.filter((a) => a.keys).map((a) => [a.id, a.keys!]));
    const nm = (id: string) => { const i = id.indexOf("@"), k = i > 0 && keysOf.get(id.slice(0, i)); return k ? `${id.slice(0, i)}#${k[+id.slice(i + 1)]}` : id; };

    let p!: Player;
    const openB = new Set<string>(); // branches the user expanded
    const showStep = () => {
      const s = p.compiled.scenarios.find((x) => x.id === p.scenario)!, st = s.steps[p.step]!;
      title.textContent = `${p.step + 1}/${s.steps.length} · ${st.title}`;
      fmt(body, st.narration);

      strip.replaceChildren(...s.steps.map((x, i) => {
        const b = h("button", { onclick: () => p.goToStep(i), title: x.title }, h("b", { textContent: String(i + 1) }), x.title);
        b.dataset.s = i < p.step ? "done" : i === p.step ? "current" : "upcoming";
        return b;
      }));
      // one tree: root scenario's steps, each branch nested under the step it leaves (own steps only)
      const cur = s.steps, at = new Map(cur.map((x, i) => [x.id, i]));
      const has = (sid: string): boolean => sid === p.scenario || c.scenarios.find((x) => x.id === sid)!.steps.some((x) => !x.inherited && x.branches.some((b) => has(b.scenario)));
      const node = (sid: string): HTMLElement => h("ol", { class: "steps" }, ...c.scenarios.find((x) => x.id === sid)!.steps.flatMap((x, i) => {
        if (x.inherited) return [];
        const j = at.get(x.id);
        const li = h("li", {}, h("button", { textContent: x.title, onclick: () => { p.setScenario(sid); p.goToStep(i); } }));
        li.dataset.s = j === undefined ? "upcoming" : j < p.step ? "done" : j === p.step ? "current" : "upcoming";
        if (li.dataset.s === "current") li.setAttribute("aria-current", "step");
        for (const b of x.branches) {
          const own = c.scenarios.find((y) => y.id === b.scenario)!.steps.filter((y) => !y.inherited).length;
          const d = h("details", { class: "branches" }, h("summary", { textContent: `⑂ ${b.title} · ${own} steps` }), node(b.scenario)) as HTMLDetailsElement;
          d.open = openB.has(b.scenario) || has(b.scenario);
          d.ontoggle = () => { d.open ? openB.add(b.scenario) : openB.delete(b.scenario); };
          li.append(d);
        }
        return [li];
      }));
      const root = c.scenarios.find((x) => !c.scenarios.some((y) => y.steps.some((z) => z.branches.some((br) => br.scenario === x.id))))!;
      steps.replaceChildren(...Array.from(node(root.id).children));
      // "What changed": group identical (prop, from, to) across targets
      const groups = new Map<string, { t: string[]; prop: string; from: string; to: string }>();
      for (const x of st.changes) { const k = `${x.prop}|${x.from}|${x.to}`; (groups.get(k) ?? groups.set(k, { t: [], prop: x.prop, from: String(x.from), to: String(x.to) }).get(k)!).t.push(x.target); }
      changes.replaceChildren(...(groups.size ? [...groups.values()].map((g) => h("li", {}, h("code", { textContent: g.t.join(", ") }), g.prop === "state" || g.prop === "visible" ? ` ${g.prop} → ${g.to}` : `: ${g.from} → ${g.to}`)) : [h("li", { textContent: "Nothing" })]));

      // live state table (settled at step end); changed cells highlighted
      const hit = new Set(st.changes.map((x) => x.target));
      const settled = stateAt(c, p.scenario, p.step);
      const cellTable = (o: (typeof c.arrays)[number] | (typeof c.grids)[number]) => {
        const cells = s.cells.filter((x) => x.owner === o.id && settled.get(x.id)?.visible !== false)
          .sort((a, b) => (settled.get(a.id)!.slot as number) - (settled.get(b.id)!.slot as number));
        const cols = "cols" in o ? o.cols : cells.length || 1;
        const keys = "keys" in o ? o.keys : undefined;
        const td = (x: { id: string }, i: number) => {
          const v = settled.get(x.id)!, e = h("td", { textContent: (keys ? `${keys[+x.id.slice(x.id.indexOf("@") + 1)]} ` : "") + String(v.label ?? "") });
          if (hit.has(nm(x.id))) e.className = "chg"; else if (v.state === "disabled") e.className = "off";
          return e;
        };
        return h("table", { class: "state" }, h("caption", { textContent: o.label ?? o.id }), ...Array.from({ length: Math.ceil(cells.length / cols) }, (_, r) => h("tr", {}, ...cells.slice(r * cols, (r + 1) * cols).map(td))));
      };
      const tok = c.tokens.length ? [h("table", { class: "state" }, h("caption", { textContent: "Tokens" }), ...c.tokens.map((x) => {
        const at = settled.get(x.id)?.at as { target?: string; edge?: string } | undefined;
        const d = h("td", { textContent: nm(at?.target ?? at?.edge ?? "") }); if (hit.has(x.id)) d.className = "chg";
        return h("tr", {}, h("th", { textContent: x.label ?? x.id }), d);
      }))] : [];
      state.replaceChildren(...[...c.arrays, ...c.grids].map(cellTable), ...tok);
      stateH.hidden = !state.children.length;

      const fr = p.frame();
      tables.replaceChildren(...[...c.arrays, ...c.grids].map((o) => {
        const cells = [...fr.ents].filter(([id, f]) => id.startsWith(o.id + "@") && f.opacity > 0.5).sort((a, b) => a[1].y! - b[1].y! || a[1].x! - b[1].x!);
        const cols = "cols" in o ? o.cols : 0;
        const rows = cols ? Array.from({ length: Math.ceil(cells.length / cols) }, (_, r) => cells.slice(r * cols, (r + 1) * cols)) : [cells];
        return h("table", {}, h("caption", { textContent: o.label ?? o.id }), ...rows.map((r) => h("tr", {}, ...r.map(([, f]) => h("td", { textContent: f.label ?? "" })))));
      }));
    };
    // "what next" prompt: before play, mid-flow what-ifs, and the end of a path
    let hk = "";
    const showHint = () => {
      const s = p.compiled.scenarios.find((x) => x.id === p.scenario)!, ended = !p.playing && p.t >= p.duration - 1e-6;
      const brs = ended ? [...new Map(s.steps.flatMap((x) => x.branches).map((b) => [b.scenario, b])).values()] : s.steps[p.step]!.branches;
      const fresh = !p.playing && p.t === 0, k = `${p.scenario}|${p.step}|${ended}|${fresh}`;
      if (k === hk) return; hk = k;
      const say = ended ? "End of this path. ▶ replays it from the start." + (brs.length ? " Or explore a what-if:" : "") : fresh ? "Press ▶ to play from the start, or ▶▶ to go one step at a time." : brs.length ? "What if…?" : "";
      const go = (b: { scenario: string }) => { p.setScenario(b.scenario); p.goToStep(Math.max(0, p.compiled.scenarios.find((x) => x.id === b.scenario)!.steps.findIndex((x) => !x.inherited))); p.play(); };
      hint.replaceChildren(...(say ? [h("p", { textContent: say })] : []), ...(say ? brs.map((b) => h("button", { textContent: `⑂ ${b.title}`, onclick: () => go(b) })) : []));
    };
    p = createPlayer(stageEl, c, {
      scenario: this.getAttribute("scenario") ?? undefined, step: Number(this.getAttribute("step")) || undefined,
      onStep: () => showStep(),
      onTime: (t, playing) => { if (!p) return; scrub.value = String(Math.round((t / p.duration) * 1000)); playBtn.textContent = playing ? "⏸" : "▶"; playBtn.ariaLabel = playing ? "Pause" : "Play"; showHint(); },
    });
    this.player = p;
    showStep(); showHint();
    playBtn.onclick = () => (p.playing ? p.pause() : p.play());
    zin.onclick = () => p.zoom(1.25); zout.onclick = () => p.zoom(0.8); zfit.onclick = () => p.fit();
    next.onclick = () => p.next(); prev.onclick = () => p.prev();
    scrub.oninput = () => p.seek((+scrub.value / 1000) * p.duration);
    speed.onchange = () => p.setSpeed(+speed.value);
    this.tabIndex = 0;
    this.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") p.next(); else if (e.key === "ArrowLeft") p.prev(); else if (e.key === " ") { e.preventDefault(); playBtn.click(); } });
    this.#ro = new ResizeObserver(() => p.resize());
    this.#ro.observe(stageEl);
    this.#resolve(p);
  }
}
if (!customElements.get("flow-player")) customElements.define("flow-player", FlowPlayerElement);
