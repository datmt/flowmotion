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

/** Search the bundled icon packs (and this browser's local icons) by name; each hit is previewed, click to use. Core is lazy: pack data loads on first search. */
export function IconPicker({ current, onPick }: { current?: string; onPick: (ref: string) => void }) {
  const [q, setQ] = useState(""), [pack, setPack] = useState(""), [hits, setHits] = useState<{ ref: string; icon?: CompiledIcon }[]>([]), [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!q.trim()) return setHits([]);
    let dead = false;
    setBusy(true);
    const t = setTimeout(async () => {
      const core = await import("@flowmotion/core"), local = getLocalIcons();
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      const mine = pack && pack !== "local" ? [] : Object.keys(local).filter((r) => words.every((w) => r.includes(w)));
      const found = pack === "local" ? [] : (await core.searchIcons(q, { pack: pack || undefined, limit: 24 })).map((h) => h.ref);
      const refs = [...mine, ...found].slice(0, 30);
      const { icons } = await core.resolveIcons(refs, local);
      if (!dead) { setHits(refs.map((ref) => ({ ref, icon: icons[ref] }))); setBusy(false); }
    }, 200);
    return () => { dead = true; clearTimeout(t); };
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
      {q.trim() && !busy && !hits.length && <p className="mt-1 text-xs text-stone-500">No icons match “{q}”.</p>}
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
