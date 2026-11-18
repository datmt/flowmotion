import { useEffect, useState } from "react";

const box = "w-full rounded border border-stone-300 bg-white px-2 py-1 text-sm";
const cap = "mb-0.5 flex justify-between text-xs font-semibold uppercase tracking-wide text-stone-500";

/** Text input/area that commits on blur (or Enter for single-line), never per keystroke: one undo entry per edit. */
export function Text({ label, value, onCommit, multiline, rows = 3, max, mono, bare }: { label?: string; value: string; onCommit: (v: string) => void; multiline?: boolean; rows?: number; max?: number; mono?: boolean; bare?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => { if (v !== value) onCommit(v); };
  const common = { value: v, "aria-label": label, onChange: (e: React.ChangeEvent<any>) => setV(e.target.value), onBlur: commit, className: `${box} ${mono ? "font-mono" : ""}` };
  return (
    <label className={bare ? "block" : "mb-2 block"}>
      {label && !bare && <span className={cap}><span>{label}</span>{max && <span className={v.length > max ? "text-red-600" : ""}>{v.length}/{max}</span>}</span>}
      {multiline ? <textarea {...common} rows={rows} /> : <input {...common} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />}
    </label>
  );
}

export function Pick({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="mb-2 block">
      <span className={cap}>{label}</span>
      <select aria-label={label} className={box} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o || "(none)"}</option>)}
      </select>
    </label>
  );
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="mb-2 mr-4 inline-flex items-center gap-1 text-sm"><input type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}

export const Heading = ({ children }: { children: React.ReactNode }) => <h3 className="mb-2 border-b border-stone-200 pb-1 text-sm font-bold">{children}</h3>;
export const mini = "rounded border border-stone-400 bg-white px-2 text-xs hover:border-emerald-600 disabled:opacity-40 disabled:hover:border-stone-400";
