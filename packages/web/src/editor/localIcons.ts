import { useSyncExternalStore } from "react";
import type { LocalIcon } from "@flowmotion/core"; // type only: core is imported lazily so the library page stays light
import * as db from "../db.ts";

// Module-level cache of the `local:` pack so the editor, viewer and share dialog read it synchronously.
type Map_ = Record<string, LocalIcon>; // keyed by full ref `local:<name>`
let icons: Map_ = {};
const subs = new Set<() => void>();
const set = (m: Map_) => { icons = m; subs.forEach((f) => f()); };
export const refresh = () => db.listIcons().then((l) => set(Object.fromEntries(l.map((i) => [`local:${i.name}`, { body: i.body, w: i.w, h: i.h }]))));
void refresh().catch(() => {});

export const getLocalIcons = () => icons;
export const useLocalIcons = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), getLocalIcons);

/** Refs in `doc` that are `local:` icons. */
export const localRefs = (doc: any): string[] => [...new Set<string>((doc?.nodes ?? []).flatMap((n: any) => (typeof n.icon === "string" && n.icon.startsWith("local:") ? [n.icon] : [])))];

/** Imports SVG text under `name` (or a name derived from `file`). Returns a one-line result per input. */
export async function importSvg(text: string, file: string): Promise<string> {
  const { localIconName, sanitizeSvg } = await import("@flowmotion/core");
  const name = localIconName(file);
  if (!name) return `${file}: no usable name`;
  const r = sanitizeSvg(text);
  if ("error" in r) return `${file}: ${r.error}`;
  await db.putIcon({ name, ...r });
  await refresh();
  return `local:${name}`;
}

/** Bulk import: many .svg files at once (file picker with multi-select, or a dropped folder's files). Duplicate names: last one wins. */
export async function importFiles(files: Iterable<File>): Promise<string[]> {
  const out: string[] = [];
  for (const f of files) if (/\.svg$/i.test(f.name)) out.push(await importSvg(await f.text(), f.name));
  return out.length ? out : ["no .svg files found"];
}
