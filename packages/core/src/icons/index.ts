import { normalizeBody, type CompiledIcon } from "./svg.ts";
export type { CompiledIcon, IconPath } from "./svg.ts";

/** `<pack>:<name>`; pack `local` is resolved in the browser only (F41). */
export const ICON_RE = /^[a-z][a-z0-9]{0,15}:[a-z0-9]+(-[a-z0-9]+)*$/;

type Pack = { size: number; icons: Record<string, string> };
// Lazy: pack data (~5 MB) is only loaded by compile/search on the server or editor, never by the player.
const loaders: Record<string, () => Promise<Pack>> = {
  lucide: () => import("./lucide.json", { with: { type: "json" } }).then((m) => m.default),
  si: () => import("./si.json", { with: { type: "json" } }).then((m) => m.default),
};
export const iconPacks = Object.keys(loaders);

const lev = (a: string, b: string) => {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) for (let j = 1, prev = d[0]!, t = (d[0] = i); j <= b.length; j++, prev = t) { t = d[j]!; d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); }
  return d[b.length]!;
};

/** Resolves refs to compiled icons. `unknown` maps each bad ref to its nearest names (`pack:name`). `local:` refs are skipped. */
export async function resolveIcons(refs: Iterable<string>): Promise<{ icons: Record<string, CompiledIcon>; unknown: Map<string, string[]> }> {
  const icons: Record<string, CompiledIcon> = {}, unknown = new Map<string, string[]>();
  for (const ref of new Set(refs)) {
    const [pack, name] = ref.split(":") as [string, string];
    if (pack === "local") continue;
    const load = loaders[pack];
    if (!load) { unknown.set(ref, [`packs: ${iconPacks.join(", ")}, local`]); continue; }
    const { size, icons: set } = await load(), body = set[name];
    if (body) icons[ref] = normalizeBody(body, size, size);
    else unknown.set(ref, Object.keys(set).map((k) => [k, k.includes(name) ? 0 : lev(name, k)] as const).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([k]) => `${pack}:${k}`));
  }
  return { icons, unknown };
}
