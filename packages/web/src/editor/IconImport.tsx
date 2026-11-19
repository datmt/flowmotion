import { useState } from "react";
import * as db from "../db.ts";
import { importFiles, importSvg, refresh, useLocalIcons } from "./localIcons.ts";
import { mini } from "./fields.tsx";

/** Browser-only `local:` icon pack: pick/drop many .svg files (e.g. an unzipped vendor icon set) or paste one SVG. Click a chip to use it. */
export function IconImport({ current, onPick }: { current?: string; onPick?: (ref: string) => void }) {
  const icons = useLocalIcons();
  const [msg, setMsg] = useState(""), [name, setName] = useState(""), [text, setText] = useState("");
  const report = (r: string[]) => setMsg(r.length === 1 && r[0]!.startsWith("local:") ? `Imported ${r[0]}` : `Imported ${r.filter((x) => x.startsWith("local:")).length}; skipped: ${r.filter((x) => !x.startsWith("local:")).join("; ") || "none"}`);
  return (
    <div className="mb-2 rounded border border-dashed border-stone-300 p-2" onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); void importFiles(e.dataTransfer.files).then(report); }}>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Local icons (this browser only)</div>
      <div className="mb-1 flex flex-wrap gap-1">
        {Object.keys(icons).map((ref) => (
          <span key={ref} className={`flex items-center rounded border text-xs ${ref === current ? "border-emerald-600" : "border-stone-300"}`}>
            <button className="max-w-40 truncate px-1" title={ref} disabled={!onPick} onClick={() => onPick?.(ref)}>{ref.slice(6)}</button>
            <button aria-label={`Remove ${ref}`} className="px-1 text-stone-500 hover:text-red-600" onClick={() => void db.removeIcon(ref.slice(6)).then(refresh)}>×</button>
          </span>
        ))}
        {!Object.keys(icons).length && <span className="text-xs text-stone-500">None yet.</span>}
      </div>
      <label className={`${mini} inline-block cursor-pointer py-0.5`}>
        Import SVGs…
        <input type="file" accept=".svg,image/svg+xml" multiple hidden aria-label="Import SVG icons" onChange={(e) => { void importFiles(e.target.files ?? []).then(report); e.target.value = ""; }} />
      </label>
      <span className="ml-1 text-xs text-stone-500">or drop files here</span>
      <details className="mt-1">
        <summary className="cursor-pointer text-xs text-stone-600">Paste SVG</summary>
        <input className="mt-1 w-full rounded border border-stone-300 px-1 text-xs" placeholder="name, e.g. my-logo" aria-label="Icon name" value={name} onChange={(e) => setName(e.target.value)} />
        <textarea className="mt-1 w-full rounded border border-stone-300 px-1 font-mono text-xs" rows={3} placeholder="<svg viewBox=…>" aria-label="SVG source" value={text} onChange={(e) => setText(e.target.value)} />
        <button className={mini} disabled={!name || !text} onClick={() => void importSvg(text, `${name}.svg`).then((r) => { report([r]); if (r.startsWith("local:")) { setName(""); setText(""); } })}>Add</button>
      </details>
      {msg && <p role="status" className="mt-1 text-xs text-stone-600">{msg}</p>}
    </div>
  );
}
