import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { compile, printDsl, type FlowDoc, type NodeKind } from "@flowmotion/core";
import type { CompiledFlow } from "@flowmotion/core/runtime";
import { createPlayer, loadFonts, type Player } from "@flowmotion/player";
import * as db from "../db.ts";
import { Shell, btn, link } from "../App.tsx";
import { addOp, connectOp, deleteOp, moveOp, relayoutOps, usedInSteps, type Addable } from "./edits.ts";
import { createOverlay } from "./overlay.ts";
import { Inspector } from "./Inspector.tsx";
import { Steps } from "./Steps.tsx";
import { createStore, type Store } from "./store.ts";

const KINDS: NodeKind[] = ["service", "state", "decision", "db", "queue", "actor", "external", "value"];
const EXTRA: Addable[] = ["array", "grid", "code", "token"];

/** The canvas: a player (scene) + interactive overlay, both rebuilt on every recompile; pan/zoom/time survive. */
function Canvas({ compiled, store, scenario, step }: { compiled: CompiledFlow; store: Store; scenario: string; step: number }) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef<{ p: Player; ov: ReturnType<typeof createOverlay> }>(undefined);
  const view = useRef<{ x: number; y: number; s: number; t: number }>(undefined);
  const applied = useRef({ scenario, step }); // last scenario/step the scene was built for: a change seeks, a plain recompile keeps time
  const sel = useSyncExternalStore(store.subscribe, () => store.get().sel);

  useEffect(() => {
    const v = view.current;
    const hidden = new Set([...store.get().doc.nodes, ...(store.get().doc.arrays ?? []), ...(store.get().doc.grids ?? []), ...(store.get().doc.code ?? [])].filter((e) => e.hidden).map((e) => e.id));
    let ov: ReturnType<typeof createOverlay> | undefined;
    const p = createPlayer(host.current!, compiled, { scenario: compiled.scenarios.some((x) => x.id === scenario) ? scenario : undefined, onTime: () => ov?.sync(), onStep: () => ov?.top() });
    const sh = compiled.shift ?? { x: 0, y: 0 };
    ov = createOverlay(p, compiled, hidden, {
      select: store.select,
      move: (id, x, y) => { const op = moveOp(store.get().doc, id, { x: Math.round(x - sh.x), y: Math.round(y - sh.y) }); if (op) store.dispatch([op], `move ${id}`); },
      connect: (from, to) => { const op = connectOp(store.get().doc, from, to); if (op && store.dispatch([op], `connect ${from} → ${to}`)) store.select(`${from}-${to}`); },
    });
    p.stage.on("click tap", (e) => { if (e.target === p.stage) store.select(); });
    if (v) { p.stage.position({ x: v.x, y: v.y }); p.stage.scale({ x: v.s, y: v.s }); }
    const moved = applied.current.scenario !== scenario || applied.current.step !== step;
    if (moved || !v) p.goToStep(Math.min(step, p.compiled.scenarios.find((x) => x.id === p.scenario)!.steps.length - 1)); else p.seek(v.t);
    applied.current = { scenario, step };
    ov.sync(); ov.setSel(store.get().sel);
    live.current = { p, ov };
    (window as any).__EDITOR__ = { store, player: p }; // test hook
    const ro = new ResizeObserver(() => p.resize());
    ro.observe(host.current!);
    return () => { view.current = { x: p.stage.x(), y: p.stage.y(), s: p.stage.scaleX(), t: p.t }; ro.disconnect(); ov!.destroy(); p.destroy(); };
  }, [compiled]);
  useEffect(() => live.current?.ov.setSel(sel), [sel]);
  useEffect(() => { // jump the current scene right away; the rebuild after the recompile repeats it for the new compiled flow
    const p = live.current?.p;
    if (!p) return;
    p.setScenario(scenario);
    p.goToStep(Math.min(step, p.compiled.scenarios.find((x) => x.id === p.scenario)!.steps.length - 1));
  }, [scenario, step]);

  return (
    <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded border border-stone-300" data-testid="canvas">
      <div ref={host} className="absolute inset-0" />
    </div>
  );
}

function Loaded({ id, rec }: { id: string; rec: db.LocalFlow }) {
  const store = useMemo(() => createStore(rec.doc as FlowDoc, rec.hist), []);
  const st = useSyncExternalStore(store.subscribe, store.get);
  const [versions, setVersions] = useState(rec.versions ?? []);
  const [compiled, setCompiled] = useState<CompiledFlow>();
  const [bad, setBad] = useState("");
  const [tab, setTab] = useState<"inspect" | "steps">("inspect");
  const [scn, setScn] = useState(st.doc.scenarios[0]!.id), [stepIx, setStep] = useState(0);
  const scenario = st.doc.scenarios.find((x) => x.id === scn) ?? st.doc.scenarios[0]!, step = Math.min(stepIx, scenario.steps.length - 1);

  // live preview: latest compile wins. ponytail: main thread; move to a Worker if ELK stalls drags on big flows.
  useEffect(() => {
    let live = true;
    compile(st.doc).then((r) => { if (!live) return; if (r.compiled) { setCompiled(r.compiled); setBad(""); } else setBad(r.issues.map((i) => i.message).join("; ")); });
    return () => { live = false; };
  }, [st.doc]);
  // autosave doc + undo history + versions
  useEffect(() => { const t = setTimeout(() => void db.save(st.doc, id, { hist: store.hist(), versions }), 150); return () => clearTimeout(t); }, [st.doc, versions]);

  const del = () => {
    if (!st.sel) return;
    if (usedInSteps(st.doc, st.sel) && !confirm(`'${st.sel}' is used in steps. Deleting it also removes those actions. Delete?`)) return;
    store.dispatch([deleteOp(st.sel)], `delete ${st.sel}`);
  };
  const add = (w: Addable) => { const a = addOp(st.doc, w); if (a && store.dispatch([a.op], `add ${a.id}`)) store.select(a.id); };
  const relayout = () => { if (!store.dispatch(relayoutOps(st.doc), "re-layout")) setBad("Nothing pinned."); };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName)) return;
      const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
      if (mod && key === "z") { e.preventDefault(); e.shiftKey ? store.redo() : store.undo(); }
      else if (mod && key === "y") { e.preventDefault(); store.redo(); }
      else if (key === "delete" || key === "backspace") { e.preventDefault(); del(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const exportDsl = () => { const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([printDsl(st.doc)], { type: "text/plain" })), download: `${id}.flow` }); a.click(); URL.revokeObjectURL(a.href); };
  const dis = "disabled:opacity-40 disabled:hover:border-stone-400";
  return (
    <Shell side={false}>
      <div className="flex flex-wrap items-center gap-2">
        <a className={`${link} text-sm`} href="/">← Library</a>
        <h1 className="mr-auto text-lg font-bold">{st.doc.meta.title}</h1>
        <button className={`${btn} ${dis}`} disabled={!st.canUndo} onClick={store.undo}>Undo</button>
        <button className={`${btn} ${dis}`} disabled={!st.canRedo} onClick={store.redo}>Redo</button>
        <button className={btn} onClick={relayout}>Re-layout</button>
        <button className={btn} onClick={() => setVersions([...versions, { t: Date.now(), label: new Date().toLocaleString(), doc: st.doc }])}>Save version ({versions.length})</button>
        {versions.length > 0 && <select className={btn} aria-label="Restore version" value="" onChange={(e) => { const v = versions[+e.target.value]; if (v) store.replace(v.doc, `restore ${v.label}`); }}><option value="" disabled>Restore…</option>{versions.map((v, i) => <option key={v.t} value={i}>{v.label}</option>)}</select>}
        <button className={btn} onClick={exportDsl}>Export .flow</button>
        <a className={btn} href={`/local/${id}`}>View</a>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-xs font-bold uppercase text-stone-500">Add</span>
        {[...KINDS, ...EXTRA].map((k) => <button key={k} className={btn} onClick={() => add(k)}>{k}</button>)}
        <button className={`${btn} ${dis}`} disabled={!st.sel} onClick={del}>Delete</button>
        {st.sel && <span className="text-xs text-stone-500">{st.sel}</span>}
      </div>
      {(st.error || bad) && <p role="alert" className="text-sm text-red-600">{st.error || bad}</p>}
      <div className="flex min-h-0 flex-1 gap-3">
        {compiled ? <Canvas compiled={compiled} store={store} scenario={scenario.id} step={step} /> : <p>Compiling…</p>}
        <aside className="flex w-80 shrink-0 flex-col rounded border border-stone-300 bg-stone-100">
          <div role="tablist" className="flex border-b border-stone-300 text-sm">
            {(["inspect", "steps"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} className={`flex-1 px-3 py-2 font-semibold capitalize ${tab === t ? "bg-white" : "text-stone-500"}`} onClick={() => setTab(t)}>{t === "inspect" ? "Inspector" : "Steps"}</button>)}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            {tab === "inspect" ? <Inspector store={store} doc={st.doc} sel={st.sel} /> : <Steps store={store} doc={st.doc} scenarioId={scenario.id} setScenario={setScn} step={step} setStep={setStep} sel={st.sel} />}
          </div>
        </aside>
      </div>
      <p className="text-xs text-stone-500">Drag a box to pin it · drag the blue dot to connect · Delete removes · Ctrl+Z / Ctrl+Shift+Z · scroll zooms, drag empty space pans.</p>
    </Shell>
  );
}

export default function Editor({ id }: { id: string }) {
  const [rec, setRec] = useState<db.LocalFlow | null>();
  useEffect(() => { loadFonts().then(() => db.load(id)).then((r) => setRec(r ?? null)); }, [id]);
  if (rec === undefined) return <Shell side={false}>Loading…</Shell>;
  if (rec === null) return <Shell side={false}><p>Flow not found in this browser. <a className={link} href="/">Back</a></p></Shell>;
  return <Loaded id={id} rec={rec} />;
}
