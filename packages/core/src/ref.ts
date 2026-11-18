import { REF_RE } from "./schema.ts";

export type ParsedRef =
  | { kind: "entity"; entity: string }
  | { kind: "index"; entity: string; index: number }
  | { kind: "range"; entity: string; from: number; to: number }
  | { kind: "key"; entity: string; key: string }
  | { kind: "grid"; entity: string; row: number; col: number };

/** Returns null if `ref` is malformed. */
export function parseRef(ref: string): ParsedRef | null {
  if (!REF_RE.test(ref)) return null;
  const [entity = "", rest] = ref.split("#");
  if (rest === undefined) return { kind: "entity", entity };
  let m;
  if ((m = /^(\d+)\.\.(\d+)$/.exec(rest))) return { kind: "range", entity, from: +m[1]!, to: +m[2]! };
  if ((m = /^(\d+)\.(\d+)$/.exec(rest))) return { kind: "grid", entity, row: +m[1]!, col: +m[2]! };
  if (/^\d+$/.test(rest)) return { kind: "index", entity, index: +rest };
  return { kind: "key", entity, key: rest };
}
