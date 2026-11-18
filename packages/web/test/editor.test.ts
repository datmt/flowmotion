import { readFileSync } from "node:fs";
import { compile } from "@flowmotion/core";
import { expect, test } from "vitest";
import { addOp, connectOp, deleteOp, labelOp, moveOp, relayoutOps, uniqueId, usedInSteps } from "../src/editor/edits.ts";
import { createStore } from "../src/editor/store.ts";

const tpl = () => JSON.parse(readFileSync(new URL("../../../templates/circuit-breaker.flow.json", import.meta.url), "utf8"));

test("drag-to-pin, relayout, label, add, connect, delete are undoable single batches", async () => {
  const s = createStore(tpl()), n0 = s.get().doc.nodes[0]!;
  const before = s.get().doc;
  expect(s.dispatch([moveOp(before, n0.id, { x: 400, y: 300 })!], "move")).toBe(true);
  expect(s.get().doc.nodes[0]!.pos).toEqual({ x: 400, y: 300 });
  expect((await compile(s.get().doc)).compiled!.shift).toBeDefined();

  s.dispatch(relayoutOps(s.get().doc), "relayout");
  expect(s.get().doc.nodes.some((n) => n.pos)).toBe(false);
  s.undo();
  expect(s.get().doc.nodes[0]!.pos).toEqual({ x: 400, y: 300 });

  s.dispatch([labelOp(s.get().doc, n0.id, "Renamed")!], "label");
  expect(s.get().doc.nodes[0]!.label).toBe("Renamed");
  expect(labelOp(s.get().doc, n0.id, "")).toBeUndefined(); // node label is required

  const a = addOp(s.get().doc, "db")!;
  s.dispatch([a.op], "add");
  expect(s.get().doc.nodes.at(-1)!.id).toBe(a.id);
  expect(uniqueId(s.get().doc, "db")).not.toBe(a.id);
  expect(s.dispatch([connectOp(s.get().doc, n0.id, a.id)!], "connect")).toBe(true);
  expect(connectOp(s.get().doc, n0.id, a.id)).toBeUndefined(); // no duplicate edge

  s.select(a.id);
  s.dispatch([deleteOp(a.id)], "delete");
  expect(s.get().sel).toBeUndefined();
  expect(s.get().doc.edges.some((e) => e.to === a.id)).toBe(false); // cascade
  s.undo(); s.undo(); s.undo();
  expect(s.get().doc.nodes[0]!.label).toBe("Renamed");
  expect(s.get().doc.nodes.some((n) => n.id === a.id)).toBe(false);
  s.redo();
  expect(s.get().doc.nodes.some((n) => n.id === a.id)).toBe(true);
  expect(usedInSteps(s.get().doc, n0.id)).toBeTypeOf("boolean");
});

test("history survives a reload (hist round-trips as JSON) and replace() is undoable", () => {
  const s = createStore(tpl());
  s.dispatch([labelOp(s.get().doc, s.get().doc.nodes[0]!.id, "X")!], "label");
  const doc = s.get().doc, h = JSON.parse(JSON.stringify(s.hist()));
  const r = createStore(doc, h);
  expect(r.get().canUndo).toBe(true);
  r.undo();
  expect(r.get().doc.nodes[0]!.label).not.toBe("X");
  r.redo();
  r.replace(tpl(), "restore");
  expect(r.get().doc.nodes[0]!.label).not.toBe("X");
  r.undo();
  expect(r.get().doc.nodes[0]!.label).toBe("X");
});
