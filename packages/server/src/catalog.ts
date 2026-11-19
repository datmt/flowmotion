import { readdirSync, readFileSync } from "node:fs";
import { parseDsl, type FlowDoc } from "@flowmotion/core";

export const CATALOG = new URL("../../../templates/", import.meta.url);

/** Every `templates/<domain>/<slug>.flow`, parsed. `path` is `<domain>/<slug>`. */
export function catalog(): { path: string; domain: string; doc: FlowDoc }[] {
  return readdirSync(CATALOG, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".flow")).sort()
    .map((f) => {
      const r = parseDsl(readFileSync(new URL(f, CATALOG), "utf8"));
      if (!r.doc) throw new Error(`${f}: ${r.issues.map((i) => i.message).join("; ")}`);
      return { path: f.slice(0, -5), domain: f.split("/")[0]!, doc: r.doc };
    });
}

/** One template by `<domain>/<slug>`. */
export const template = (path: string): FlowDoc => catalog().find((t) => t.path === path)!.doc;
