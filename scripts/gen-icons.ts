// Builds compact icon pack data (name → SVG body, aliases resolved) from the Iconify JSON dev dependencies.
// Run: pnpm gen:icons   Packs and licences: assets/icons/LICENSES.md
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const PACKS = { lucide: "@iconify-json/lucide", si: "@iconify-json/simple-icons" } as const;

for (const [prefix, pkg] of Object.entries(PACKS)) {
  const set = require(`${pkg}/icons.json`) as { width?: number; height?: number; icons: Record<string, { body: string; width?: number; height?: number }>; aliases?: Record<string, { parent: string }> };
  const icons: Record<string, string> = {};
  for (const [name, i] of Object.entries(set.icons)) if (!i.width && !i.height) icons[name] = i.body; // all icons share the set's 24x24 box
  for (const [alias, { parent }] of Object.entries(set.aliases ?? {})) if (icons[parent]) icons[alias] = icons[parent]!;
  const size = set.width ?? 24;
  writeFileSync(new URL(`../packages/core/src/icons/${prefix}.json`, import.meta.url), JSON.stringify({ size, icons }) + "\n");
  console.log(prefix, Object.keys(icons).length);
}
