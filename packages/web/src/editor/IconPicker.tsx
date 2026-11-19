import { useEffect, useState } from "react";
import type { CompiledIcon } from "@flowmotion/core/runtime";
import { getLocalIcons } from "./localIcons.ts";

const PACKS = ["", "lucide", "si", "carbon", "devicon"]; // ponytail: mirrors core iconPacks; read them from core if packs change often

/** Inline preview of a compiled icon: mono icons take the surrounding text colour, coloured logos keep theirs. */
export function IconSvg({ icon, size = 28 }: { icon: CompiledIcon; size?: number }) {
  return (
    <svg viewBox={`0 0 ${icon.w} ${icon.h}`} width={size} height={size} aria-hidden>
      {icon.paths.map((p, i) => <path key={i} d={p.d} fill={p.fill} stroke={p.stroke} strokeWidth={p.sw} strokeLinecap={p.cap as "round"} strokeLinejoin={p.join as "round"} />)}
    </svg>
  );
}

/** Ajax search: GET /api/icons (bundled packs, with preview data) plus this browser's local icons; each hit is previewed, click to use. */
export function IconPicker({ current, onPick }: { current?: string; onPick: (ref: string) => void }) {
  const [q, setQ] = useState(""), [pack, setPack] = useState(""), [hits, setHits] = useState<{ ref: string; icon?: CompiledIcon }[]>([]), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  useEffect(() => {
    if (!q.trim()) return setHits([]);
    let dead = false;
    const ctl = new AbortController();
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const local = getLocalIcons(), words = q.toLowerCase().split(/\s+/).filter(Boolean);
        const mine = pack && pack !== "local" ? [] : Object.keys(local).filter((r) => words.every((w) => r.includes(w)));
        const mineIcons = mine.length ? (await (await import("@flowmotion/core")).resolveIcons(mine, local)).icons : {};
        const r = pack === "local" ? undefined : await fetch(`/api/icons?preview=1&limit=24&q=${encodeURIComponent(q)}${pack ? `&pack=${pack}` : ""}`, { signal: ctl.signal });
        if (r && !r.ok) throw new Error(`search failed (${r.status})`);
        const found: { ref: string; icon?: CompiledIcon }[] = r ? (await r.json()).icons : [];
        if (!dead) { setHits([...mine.map((ref) => ({ ref, icon: mineIcons[ref] })), ...found].slice(0, 30)); setErr(""); }
      } catch (e) { if (!dead) setErr(String((e as Error).message ?? e)); }
      if (!dead) setBusy(false);
    }, 200);
    return () => { dead = true; ctl.abort(); clearTimeout(t); };
  }, [q, pack]);
  return (
    <div className="mb-2">
      <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-stone-500">Find icon</div>
      <div className="flex gap-1">
        <input className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1 text-sm" placeholder="search, e.g. postgres" aria-label="Search icons" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="rounded border border-stone-300 px-1 text-xs" aria-label="Icon pack" value={pack} onChange={(e) => setPack(e.target.value)}>
          {[...PACKS, "local"].map((p) => <option key={p} value={p}>{p || "all"}</option>)}
        </select>
      </div>
      {busy && <p className="mt-1 text-xs text-stone-500">Searching…</p>}
      {err && <p role="alert" className="mt-1 text-xs text-red-600">{err}</p>}
      {q.trim() && !busy && !err && !hits.length && <p className="mt-1 text-xs text-stone-500">No icons match “{q}”.</p>}
      <div className="mt-1 grid grid-cols-4 gap-1" role="list" aria-label="Icon results">
        {hits.map(({ ref, icon }) => (
          <button key={ref} role="listitem" title={ref} aria-label={ref} onClick={() => onPick(ref)}
            className={`flex flex-col items-center rounded border p-1 text-stone-800 hover:border-emerald-600 ${ref === current ? "border-emerald-600 bg-emerald-50" : "border-stone-300"}`}>
            {icon ? <IconSvg icon={icon} /> : <span className="h-7" />}
            <span className="mt-0.5 w-full truncate text-center text-[10px] text-stone-600">{ref.slice(ref.indexOf(":") + 1)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
