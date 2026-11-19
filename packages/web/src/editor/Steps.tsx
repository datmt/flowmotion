import type { FlowDoc } from "@flowmotion/core";
import { addScenarioOp, addStepOp, moveStepOp, newAction, SIMPLE_ACTIONS, stepOp, type SimpleAction } from "./edits.ts";
import { Heading, mini, Pick, Text } from "./fields.tsx";
import type { Store } from "./store.ts";

const TIMING = new Set(["do", "start", "delay", "dur", "ease"]);
const EFFECTS = ["shake", "grow", "fade", "flash"];
const STATES = ["idle", "active", "success", "error", "warning", "pending", "disabled"];
const summary = (a: any) => Object.entries(a).filter(([k]) => !TIMING.has(k)).map(([, v]) => (Array.isArray(v) ? v.join(",") : String(v))).join(" ");

/** Scenario tabs + step list. The active step is expanded: title, narration, actions (text/state editable, deletable). */
export function Steps({ store, doc, scenarioId, setScenario, step, setStep, sel }: { store: Store; doc: FlowDoc; scenarioId: string; setScenario: (id: string) => void; step: number; setStep: (i: number) => void; sel?: string }) {
  const sc = doc.scenarios.find((s) => s.id === scenarioId)!;
  const cur = sc.steps[Math.min(step, sc.steps.length - 1)]!, idx = sc.steps.indexOf(cur);
  const put = (patch: Record<string, unknown>, what: string) => store.dispatch([stepOp(sc.id, { ...cur, ...patch } as any)], `${what} ${cur.id}`);
  const setAction = (i: number, patch: Record<string, unknown>) => put({ actions: cur.actions.map((a, k) => (k === i ? { ...a, ...patch } : a)) }, "action");

  const addStep = () => { const a = addStepOp(doc, sc.id, cur.id); if (store.dispatch([a.op], `add step ${a.id}`)) setStep(idx + 1); };
  const rmStep = () => { if (store.dispatch([{ op: "removeStep", scenario: sc.id, step: cur.id }], `remove step ${cur.id}`)) setStep(Math.max(0, idx - 1)); };
  const move = (dir: -1 | 1) => { const op = moveStepOp(doc, sc.id, idx, dir); if (op && store.dispatch([op], `move step ${cur.id}`)) setStep(idx + dir); };
  const addScenario = () => { const a = addScenarioOp(doc); if (store.dispatch([a.op], `add scenario ${a.id}`)) { setScenario(a.id); setStep(0); } };
  const rmScenario = () => { if (confirm(`Delete scenario '${sc.title}'?`) && store.dispatch([{ op: "removeScenario", id: sc.id }], `remove scenario ${sc.id}`)) setScenario(doc.scenarios.find((s) => s.id !== sc.id)!.id); };

  return (
    <div>
      <Heading>Scenario</Heading>
      <div className="mb-2 flex gap-1">
        <select aria-label="Scenario" className="min-w-0 flex-1 rounded border border-stone-300 bg-white px-1 text-sm" value={sc.id} onChange={(e) => { setScenario(e.target.value); setStep(0); }}>
          {doc.scenarios.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
        <button className={mini} disabled={doc.scenarios.length >= 8} onClick={addScenario}>+ new</button>
        <button className={mini} disabled={doc.scenarios.length <= 1} onClick={rmScenario}>delete</button>
      </div>
      <Text label="Scenario title" max={80} value={sc.title} onCommit={(title) => store.dispatch([{ op: "upsertScenario", value: { ...sc, title } }], "scenario title")} />

      <Heading>Steps</Heading>
      <ol className="mb-2 space-y-1">
        {sc.steps.map((s, i) => (
          <li key={s.id}><button aria-current={i === idx} className={`w-full truncate rounded px-2 py-1 text-left text-sm ${i === idx ? "bg-emerald-100 font-semibold" : "hover:bg-stone-200/60"}`} onClick={() => setStep(i)}>{i + 1}. {s.title}</button></li>
        ))}
      </ol>
      <div className="mb-3 flex gap-1">
        <button className={mini} disabled={sc.steps.length >= 40} onClick={addStep}>+ step</button>
        <button className={mini} disabled={idx === 0} onClick={() => move(-1)}>↑</button>
        <button className={mini} disabled={idx === sc.steps.length - 1} onClick={() => move(1)}>↓</button>
        <button className={mini} disabled={sc.steps.length <= 1} onClick={rmStep}>remove</button>
      </div>

      <div key={`${sc.id}/${cur.id}`}>
        <Text label="Step title" max={60} value={cur.title} onCommit={(title) => put({ title }, "title")} />
        <Text label="Narration" multiline rows={5} max={400} value={cur.narration} onCommit={(narration) => put({ narration }, "narration")} />
        <Text label="Hold after (s)" value={cur.hold === undefined ? "" : String(cur.hold)} onCommit={(t) => put({ hold: t === "" ? undefined : Number(t) }, "hold")} />
        <Heading>Actions</Heading>
        <ul className="mb-2 space-y-2">
          {cur.actions.map((a: any, i) => (
            <li key={i} className="rounded border border-stone-200 bg-white p-2 text-sm">
              <div className="flex items-start gap-1">
                <span className="min-w-0 flex-1 break-words"><b>{a.do}</b> <span className="text-stone-500">{summary(a)}</span></span>
                <button className={mini} aria-label={`Remove action ${i + 1}`} onClick={() => put({ actions: cur.actions.filter((_, k) => k !== i) }, "remove action")}>✕</button>
              </div>
              {(a.do === "label" || a.do === "callout") && <Text bare label={`${a.do} text`} max={a.do === "label" ? 60 : 120} value={a.text} onCommit={(text) => setAction(i, { text })} />}
              {a.do === "effect" && <Pick label="Effect" value={a.name} options={EFFECTS} onChange={(name) => setAction(i, { name })} />}
              {a.do === "state" && <Pick label="State" value={a.state} options={STATES} onChange={(state) => setAction(i, { state })} />}
            </li>
          ))}
          {cur.actions.length === 0 && <li className="text-xs text-stone-500">No actions.</li>}
        </ul>
        <label className="block text-xs text-stone-500">
          {sel ? <>Add action on <code>{sel}</code></> : "Select an entity to add an action"}
          <select aria-label="Add action" className="mt-1 block w-full rounded border border-stone-300 bg-white px-1 py-1 text-sm disabled:opacity-40" disabled={!sel || cur.actions.length >= 12} value="" onChange={(e) => put({ actions: [...cur.actions, newAction(e.target.value as SimpleAction, sel!)] }, "add action")}>
            <option value="" disabled>Add action…</option>
            {SIMPLE_ACTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}
