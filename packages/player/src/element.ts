import type { CompiledFlow } from "@flowmotion/core/runtime";
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
:host{display:block;font:14px/1.45 Inter,system-ui,sans-serif;color:var(--fg);--fg:#1f2937;--bg:#fff;--line:#d1d5db;--accent:#2563eb}
:host([theme=dark]){--fg:#e2e8f0;--bg:#0f172a;--line:#334155;--accent:#60a5fa}
.wrap{background:var(--bg);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.stage{width:100%;aspect-ratio:16/9}
.narr{padding:12px 16px;border-top:1px solid var(--line);min-height:3.2em}
.narr b.t{display:block;font-size:12px;opacity:.7;text-transform:uppercase;letter-spacing:.04em}
.narr code{font-family:'JetBrains Mono',monospace;background:color-mix(in srgb,var(--fg) 10%,transparent);padding:0 .25em;border-radius:3px}
.bar{display:flex;gap:8px;align-items:center;padding:8px 12px;border-top:1px solid var(--line);flex-wrap:wrap}
button,select{font:inherit;color:inherit;background:transparent;border:1px solid var(--line);border-radius:6px;padding:4px 10px;cursor:pointer}
button:hover{border-color:var(--accent)} button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid var(--accent)}
input[type=range]{flex:1;min-width:120px;accent-color:var(--accent)}
.branches{display:flex;gap:6px;padding:0 12px 8px}.branches button{border-color:var(--accent);color:var(--accent)}
ol.steps{margin:0;padding:8px 12px 12px 32px;border-top:1px solid var(--line)} ol.steps button{border:0;padding:2px 4px;text-align:left} ol.steps li[aria-current=step] button{font-weight:700;color:var(--accent)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
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
    if (json.scenarios?.[0]?.tracks) return json; // already compiled
    const { compile } = await import("@flowmotion/core"); // lazy: keeps zod/elk/shiki out of the embed bundle
    const r = await compile(json);
    if (!r.compiled) throw new Error(r.issues.map((i) => `${i.code}: ${i.message}`).join("\n"));
    return r.compiled;
  }

  #build(root: ShadowRoot, c: CompiledFlow) {
    const stageEl = h("div", { class: "stage" });
    stageEl.style.aspectRatio = c.meta.aspect.replace(":", "/");
    const narr = h("div", { class: "narr", ariaLive: "polite" } as object);
    const title = h("b", { class: "t" }), body = h("div");
    narr.append(title, body);
    const branches = h("div", { class: "branches" });
    const playBtn = h("button", { class: "play", textContent: "▶", ariaLabel: "Play" } as object);
    const prev = h("button", { class: "prev", textContent: "◀", ariaLabel: "Previous step" } as object);
    const next = h("button", { class: "next", textContent: "▶▶", ariaLabel: "Next step" } as object);
    const scrub = h("input", { type: "range", min: "0", max: "1000", value: "0", ariaLabel: "Seek" } as object) as HTMLInputElement;
    const speed = h("select", { ariaLabel: "Speed" } as object, ...["0.5", "1", "1.5", "2"].map((v) => h("option", { value: v, textContent: `${v}×`, selected: v === "1" }))) as HTMLSelectElement;
    const mode = h("select", { ariaLabel: "Mode" } as object, h("option", { value: "step", textContent: "Step" }), h("option", { value: "play", textContent: "Play" })) as HTMLSelectElement;
    const scen = h("select", { ariaLabel: "Scenario" } as object, ...c.scenarios.map((s) => h("option", { value: s.id, textContent: s.title }))) as HTMLSelectElement;
    scen.hidden = c.scenarios.length < 2;
    const steps = h("ol", { class: "steps", ariaLabel: "Steps" } as object);
    const tables = h("div", { class: "sr" });
    const bar = h("div", { class: "bar" }, prev, playBtn, next, scrub, speed, mode, scen);
    root.append(h("div", { class: "wrap" }, stageEl, narr, branches, bar, steps), tables);

    let p!: Player;
    const showStep = () => {
      const s = p.compiled.scenarios.find((x) => x.id === p.scenario)!, st = s.steps[p.step]!;
      title.textContent = `${p.step + 1}/${s.steps.length} · ${st.title}`;
      fmt(body, st.narration);
      branches.replaceChildren(...st.branches.map((b) => h("button", { textContent: `⑂ ${b.title}`, onclick: () => { p.setScenario(b.scenario); scen.value = b.scenario; } })));
      steps.replaceChildren(...s.steps.map((x, i) => { const li = h("li", {}, h("button", { textContent: x.title, onclick: () => p.goToStep(i) })); if (i === p.step) li.setAttribute("aria-current", "step"); return li; }));
      const fr = p.frame();
      tables.replaceChildren(...[...c.arrays, ...c.grids].map((o) => {
        const cells = [...fr.ents].filter(([id, f]) => id.startsWith(o.id + "@") && f.opacity > 0.5).sort((a, b) => a[1].y! - b[1].y! || a[1].x! - b[1].x!);
        const cols = "cols" in o ? o.cols : 0;
        const rows = cols ? Array.from({ length: Math.ceil(cells.length / cols) }, (_, r) => cells.slice(r * cols, (r + 1) * cols)) : [cells];
        const t = h("table", {}, h("caption", { textContent: o.label ?? o.id }), ...rows.map((r) => h("tr", {}, ...r.map(([, f]) => h("td", { textContent: f.label ?? "" })))));
        return t;
      }));
    };
    p = createPlayer(stageEl, c, {
      onStep: () => showStep(),
      onTime: (t, playing) => { if (!p) return; scrub.value = String(Math.round((t / p.duration) * 1000)); playBtn.textContent = playing ? "⏸" : "▶"; playBtn.ariaLabel = playing ? "Pause" : "Play"; },
    });
    this.player = p;
    showStep();
    playBtn.onclick = () => (p.playing ? p.pause() : p.play());
    next.onclick = () => p.next(); prev.onclick = () => p.prev();
    scrub.oninput = () => p.seek((+scrub.value / 1000) * p.duration);
    speed.onchange = () => p.setSpeed(+speed.value); mode.onchange = () => p.setMode(mode.value as "step" | "play");
    scen.onchange = () => p.setScenario(scen.value);
    this.tabIndex = 0;
    this.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") p.next(); else if (e.key === "ArrowLeft") p.prev(); else if (e.key === " ") { e.preventDefault(); playBtn.click(); } });
    this.#ro = new ResizeObserver(() => p.resize());
    this.#ro.observe(stageEl);
    this.#resolve(p);
  }
}
if (!customElements.get("flow-player")) customElements.define("flow-player", FlowPlayerElement);
