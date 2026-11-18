import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { printDsl } from "@flowmotion/core";
import { editWithAI, generate, MAX_REPAIRS, type GenEvent, type Model } from "./generate.ts";
import { memoryStore } from "./store.ts";

const tpl = JSON.parse(readFileSync(new URL("../../../templates/binary-search.flow.json", import.meta.url), "utf8"));
const good = printDsl(tpl);
const c = { store: memoryStore() };
const run = async (m: Model) => { const ev: GenEvent[] = []; for await (const e of generate(c, m, { prompt: "binary search" })) ev.push(e); return ev; };

test("generate: repairs an invalid draft, then stops on a valid doc", async () => {
  const seen: string[] = [];
  const ev = await run(async (_s, msgs) => { seen.push(JSON.stringify(msgs.at(-1))); return seen.length === 1 ? "flow \"x\"\nbogus line" : good; });
  expect(seen).toHaveLength(2);
  expect(seen[1]).toContain("Invalid. Fix every issue");
  expect(ev.at(-1)).toMatchObject({ type: "done" });
});

test(`generate: gives up after ${MAX_REPAIRS} repair rounds`, async () => {
  let calls = 0;
  const ev = await run(async () => (calls++, "nonsense"));
  expect(calls).toBe(MAX_REPAIRS + 1);
  expect(ev.at(-1)).toMatchObject({ type: "error" });
});

test("editWithAI: returns one op batch, repairs a bad one", async () => {
  let calls = 0;
  const r = await editWithAI(async () => (calls++ ? '```json\n[{"op":"setMeta","value":{"title":"New"}}]\n```' : '[{"op":"remove","id":"nope"}]'), { doc: tpl, instruction: "rename" });
  expect(calls).toBe(2);
  expect(r.ops).toEqual([{ op: "setMeta", value: { title: "New" } }]);
});
