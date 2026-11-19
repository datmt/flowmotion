import { ICON_RE, type FlowDoc } from "@flowmotion/core";
import { IconImport } from "./IconImport.tsx";
import { IconPicker } from "./IconPicker.tsx";
import { find, metaOp, setOp } from "./edits.ts";
import { Check, Heading, mini, Pick, Text } from "./fields.tsx";
import type { Store } from "./store.ts";

const KINDS = ["service", "state", "decision", "db", "queue", "actor", "external", "value"];
const TONES = ["", "primary", "muted", "danger"];
const STATES = ["", "idle", "active", "success", "error", "warning", "pending", "disabled"];

/** Edit whatever is selected; with nothing selected, edit the flow itself. One commit = one undo entry. */
export function Inspector({ store, doc, sel }: { store: Store; doc: FlowDoc; sel?: string }) {
  const f = sel ? find(doc, sel) : undefined;
  const set = (patch: Record<string, unknown>, what = "edit") => { const op = sel && setOp(doc, sel, patch); if (op) store.dispatch([op], `${what} ${sel}`); };
  const groups = ["", ...(doc.groups ?? []).map((g) => g.id)];
  if (!f) {
    const m = doc.meta, l = doc.layout ?? {};
    const lay = (k: string, v: string) => store.dispatch([metaOp({ layout: { [k]: v || undefined } })], "layout");
    return (
      <div>
        <Heading>Flow</Heading>
        <IconImport />
        <Text label="Title" max={80} value={m.title} onCommit={(title) => store.dispatch([metaOp({ title })], "title")} />
        <Text label="Summary" multiline max={280} value={m.summary ?? ""} onCommit={(summary) => store.dispatch([metaOp({ summary })], "summary")} />
        <Pick label="Theme" value={m.theme ?? "light"} options={["light", "dark"]} onChange={(theme) => store.dispatch([metaOp({ theme: theme as "light" })], "theme")} />
        <Pick label="Aspect" value={m.aspect ?? "16:9"} options={["16:9", "4:3", "1:1", "9:16"]} onChange={(aspect) => store.dispatch([metaOp({ aspect: aspect as "16:9" })], "aspect")} />
        <Pick label="Layout" value={l.algorithm ?? "layered"} options={["layered", "tree", "stress", "sequence"]} onChange={(v) => lay("algorithm", v)} />
        <Pick label="Direction" value={l.direction ?? "LR"} options={["LR", "TB"]} onChange={(v) => lay("direction", v)} />
        <Pick label="Edge style" value={l.edges ?? "orthogonal"} options={["orthogonal", "straight"]} onChange={(v) => lay("edges", v)} />
        <p className="text-xs text-stone-500">Select something on the canvas to edit it.</p>
      </div>
    );
  }

  const v = f.value;
  return (
    <div key={sel}>
      <Heading>{f.entity} <code className="font-normal text-stone-500">{sel}</code></Heading>
      {(f.entity === "node" || f.entity === "group" || f.entity === "array" || f.entity === "grid" || f.entity === "edge" || f.entity === "token") && (
        <Text label="Label" value={v.label ?? ""} max={f.entity === "edge" ? 30 : f.entity === "token" ? 20 : 40} onCommit={(t) => set({ label: t || undefined }, "label")} />
      )}
      {f.entity === "node" && <>
        <Pick label="Kind" value={v.kind} options={KINDS} onChange={(kind) => set({ kind })} />
        <Pick label="Initial state" value={v.state ?? ""} options={STATES} onChange={(state) => set({ state: state || undefined })} />
        <Pick label="Tone" value={v.tone ?? ""} options={TONES} onChange={(tone) => set({ tone: tone || undefined }, "tone")} />
        <Text label="Icon (pack:name)" max={40} value={v.icon ?? ""} onCommit={(t) => { const icon = t.trim(); if (!icon || ICON_RE.test(icon)) set({ icon: icon || undefined }, "icon"); }} />
        <IconPicker current={v.icon} onPick={(icon) => set({ icon }, "icon")} />
        <IconImport current={v.icon} onPick={(icon) => set({ icon }, "icon")} />
      </>}
      {f.entity === "group" && <Pick label="Tone" value={v.tone ?? ""} options={TONES} onChange={(tone) => set({ tone: tone || undefined }, "tone")} />}
      {f.entity === "edge" && <>
        <Check label="Dashed" checked={!!v.dashed} onChange={(c) => set({ dashed: c || undefined })} />
        <Check label="Arrow" checked={v.arrow ?? true} onChange={(c) => set({ arrow: c ? undefined : false })} />
        <p className="mb-2 text-xs text-stone-500">{v.from} → {v.to}</p>
      </>}
      {f.entity === "array" && <>
        <Text label="Values (one per line)" multiline rows={6} mono max={64} value={v.values.join("\n")} onCommit={(t) => set({ values: t.split("\n") }, "values")} />
        <Pick label="Orientation" value={v.orientation ?? "row"} options={["row", "column"]} onChange={(o) => set({ orientation: o === "row" ? undefined : o })} />
      </>}
      {f.entity === "grid" && <Grid rows={v.rows} onChange={(rows) => set({ rows }, "cells")} />}
      {f.entity === "code" && <>
        <Text label="Title" max={60} value={v.title ?? ""} onCommit={(t) => set({ title: t || undefined })} />
        <Text label="Language" max={30} value={v.language} onCommit={(language) => set({ language })} />
        <Text label="Code" multiline rows={12} mono max={8000} value={v.code} onCommit={(code) => set({ code }, "code")} />
      </>}
      {["node", "array", "grid"].includes(f.entity) && <Pick label="Group" value={v.group ?? ""} options={groups} onChange={(g) => set({ group: g || undefined })} />}
      {f.entity !== "group" && <Check label="Hidden at start" checked={!!v.hidden} onChange={(c) => set({ hidden: c || undefined })} />}
    </div>
  );
}

function Grid({ rows, onChange }: { rows: string[][]; onChange: (r: string[][]) => void }) {
  const w = rows[0]!.length;
  return (
    <div className="mb-2">
      <div className="mb-1 flex gap-1">
        <button className={mini} disabled={rows.length >= 16} onClick={() => onChange([...rows, Array(w).fill("0")])}>+ row</button>
        <button className={mini} disabled={rows.length <= 1} onClick={() => onChange(rows.slice(0, -1))}>− row</button>
        <button className={mini} disabled={w >= 16} onClick={() => onChange(rows.map((r) => [...r, "0"]))}>+ col</button>
        <button className={mini} disabled={w <= 1} onClick={() => onChange(rows.map((r) => r.slice(0, -1)))}>− col</button>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${w}, minmax(0, 1fr))` }}>
        {rows.flatMap((r, i) => r.map((c, j) => <Text key={`${i}.${j}`} bare label={`Cell ${i},${j}`} value={c} max={40} onCommit={(t) => onChange(rows.map((rr, a) => rr.map((cc, b) => (a === i && b === j ? t : cc))))} />))}
      </div>
    </div>
  );
}
