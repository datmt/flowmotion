import { useState } from "react";
import type { FlowDoc, Op } from "@flowmotion/core";
import { btn } from "../App.tsx";
import { changedIds } from "./edits.ts";
import type { Store } from "./store.ts";

export interface Version { t: number; label: string; doc: any; prompt?: string }

/** AI tab: edit the selection (or the whole flow) with a prompt; revision list with one-click restore. */
export function AiPanel({ store, doc, sel, versions, addVersion, onChanged }: {
  store: Store; doc: FlowDoc; sel?: string; versions: Version[]; addVersion(v: Version): void; onChanged(ids: string[]): void;
}) {
  const [text, setText] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const run = async () => {
    const instruction = text.trim(), before = doc;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/ai-edit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ doc, instruction, selectedIds: sel ? [sel] : [] }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.issues ? b.issues.map((i: any) => i.message).join("; ") : b.message ?? b.error);
      addVersion({ t: Date.now(), label: "Before AI edit", doc: before, prompt: instruction });
      if (!store.dispatch(b.ops as Op[], `AI: ${instruction}`)) throw new Error(store.get().error ?? "Edit rejected.");
      onChanged(changedIds(before, store.get().doc));
      setText("");
    } catch (e) { setErr(String((e as Error).message)); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-3 text-sm">
      <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim() && !busy) void run(); }}>
        <textarea aria-label="AI instruction" className="h-24 rounded-md border border-stone-400 p-2" maxLength={2000} disabled={busy} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={sel ? `Change '${sel}'… e.g. rename it and add a failure step` : "Change the flow… select something to focus the edit"} />
        <button className={btn} disabled={busy || !text.trim()}>{busy ? "Thinking…" : sel ? `Edit '${sel}'` : "Edit flow"}</button>
        {err && <p role="alert" className="text-red-600">{err}</p>}
      </form>
      <div>
        <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-stone-500">Versions</h3>
        {versions.length === 0 && <p className="text-stone-400">None yet. AI edits and "Save version" add one.</p>}
        <ul className="flex flex-col gap-1">
          {versions.map((v, i) => (
            <li key={v.t + ":" + i} className="flex items-start gap-2 rounded border border-stone-300 bg-white p-2">
              <div className="min-w-0 flex-1"><div className="truncate font-medium">{v.label}</div><div className="text-xs text-stone-500">{new Date(v.t).toLocaleString()}</div>{v.prompt && <div className="truncate text-xs italic" title={v.prompt}>“{v.prompt}”</div>}</div>
              <button className={btn} onClick={() => store.replace(v.doc, `restore ${v.label}`)}>Restore</button>
            </li>
          )).reverse()}
        </ul>
      </div>
    </div>
  );
}
