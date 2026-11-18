import { FlowDoc, type Action } from "./schema.ts";
import { parseRef, type ParsedRef } from "./ref.ts";
import { applySwap, applyValues, actionRefs, createCellSim, resolveCells } from "./cells.ts";
import { flattenScenario, scheduleScenario } from "./timing.ts";

export type IssueCode =
  | "schema" | "duplicate_id" | "unknown_ref" | "bad_ref" | "wrong_target_type" | "range_not_allowed"
  | "cell_out_of_bounds" | "keys_length_mismatch" | "no_edge" | "ambiguous_edge" | "branch_cycle"
  | "unknown_branch_step" | "limit_exceeded";

export interface Issue {
  severity: "error" | "warning";
  code: IssueCode | (string & {});
  path: string; // JSON Pointer
  where: string; // "scenario › step › action 3"
  message: string;
  hint?: string;
}

export type ValidateResult = { ok: true; issues: Issue[]; doc: FlowDoc } | { ok: false; issues: Issue[]; doc?: undefined };

const MAX_ENTITIES = 300;
const MAX_BYTES = 1_000_000;
const MAX_CODE_LINES = 80;
const MAX_DURATION = 180;

type EType = "group" | "node" | "edge" | "array" | "grid" | "token" | "code";
const ANY: EType[] = ["group", "node", "edge", "array", "grid", "token", "code"];

const ptr = (p: (string | number | symbol)[]) => p.map((s) => "/" + String(s).replace(/~/g, "~0").replace(/\//g, "~1")).join("");

export function lev(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length]!;
}

/** Human-readable location for a JSON Pointer path in the (valid-shaped or raw) doc. */
function where(doc: any, path: (string | number | symbol)[]): string {
  const [root, i, sub, j, sub2, k] = path;
  if (root === "scenarios" && typeof i === "number") {
    const sc = doc?.scenarios?.[i];
    const parts = [sc?.id ?? `scenario ${i + 1}`];
    if (sub === "steps" && typeof j === "number") {
      parts.push(sc?.steps?.[j]?.id ?? `step ${j + 1}`);
      if (sub2 === "actions" && typeof k === "number") parts.push(`action ${k + 1}`);
    }
    return parts.join(" › ");
  }
  return path.map(String).join(" › ") || "document";
}

export function validate(input: unknown): ValidateResult {
  const issues: Issue[] = [];

  const parsed = FlowDoc.safeParse(input);
  if (!parsed.success) {
    for (const z of parsed.error.issues)
      issues.push({ severity: "error", code: "schema", path: ptr(z.path), where: where(input, z.path), message: z.message });
    return { ok: false, issues };
  }
  const doc = parsed.data;
  const err = (path: (string | number)[], code: IssueCode, message: string, hint?: string) =>
    issues.push({ severity: "error", code, path: ptr(path), where: where(doc, path), message, ...(hint ? { hint } : {}) });

  // — limits —
  const count = [doc.groups, doc.nodes, doc.edges, doc.arrays, doc.grids, doc.tokens, doc.code].reduce((n, a) => n + (a?.length ?? 0), 0);
  if (count > MAX_ENTITIES) err([], "limit_exceeded", `${count} entities; the limit is ${MAX_ENTITIES}.`, "Split into several flows or remove detail.");
  const bytes = new TextEncoder().encode(JSON.stringify(input)).length;
  if (bytes > MAX_BYTES) err([], "limit_exceeded", `Document is ${bytes} bytes; the limit is ${MAX_BYTES}.`);
  doc.code?.forEach((c, i) => {
    const n = c.code.split("\n").length;
    if (n > MAX_CODE_LINES) err(["code", i, "code"], "limit_exceeded", `Code block has ${n} lines; the limit is ${MAX_CODE_LINES}.`);
  });

  // — entity table + duplicate ids —
  const ents = new Map<string, { type: EType; i: number }>();
  const edges = new Map<string, { from: string; to: string }>();
  const add = (id: string, type: EType, i: number, path: (string | number)[]) => {
    const prev = ents.get(id);
    if (prev) err(path, "duplicate_id", `Id '${id}' is already used by a ${prev.type}.`, "Ids must be unique across the whole document; give edges an explicit 'id'.");
    else ents.set(id, { type, i });
  };
  doc.groups?.forEach((e, i) => add(e.id, "group", i, ["groups", i, "id"]));
  doc.nodes.forEach((e, i) => add(e.id, "node", i, ["nodes", i, "id"]));
  doc.edges.forEach((e, i) => {
    const id = e.id ?? `${e.from}-${e.to}`;
    add(id, "edge", i, e.id ? ["edges", i, "id"] : ["edges", i]);
    if (!edges.has(id)) edges.set(id, { from: e.from, to: e.to });
  });
  doc.arrays?.forEach((e, i) => add(e.id, "array", i, ["arrays", i, "id"]));
  doc.grids?.forEach((e, i) => add(e.id, "grid", i, ["grids", i, "id"]));
  doc.tokens?.forEach((e, i) => add(e.id, "token", i, ["tokens", i, "id"]));
  doc.code?.forEach((e, i) => add(e.id, "code", i, ["code", i, "id"]));

  const idsOf = (types: EType[]) => [...ents].filter(([, v]) => types.includes(v.type)).map(([k]) => k);
  const hintFor = (id: string, types: EType[]) => {
    const best = idsOf(types).map((c) => [c, lev(id, c)] as const).filter(([, d]) => d <= 2).sort((a, b) => a[1] - b[1])[0];
    return best ? `Did you mean '${best[0]}'?` : undefined;
  };

  /** Expect an entity id of one of `types`. */
  const expectId = (id: string, types: EType[], path: (string | number)[]): EType | undefined => {
    const e = ents.get(id);
    if (!e) return void err(path, "unknown_ref", `${types.join("/")} '${id}' does not exist.`, hintFor(id, types));
    if (!types.includes(e.type)) return void err(path, "wrong_target_type", `'${id}' is a ${e.type}, expected ${types.join(" or ")}.`);
    return e.type;
  };

  /** Expect a Ref: entity of `entity` types and/or a cell (`cell`), ranges only if `range`. */
  const expectRef = (ref: string, path: (string | number)[], o: { entity: EType[]; cell?: boolean; range?: boolean }): ParsedRef | undefined => {
    const p = parseRef(ref)!; // shape already checked by Zod
    const owner = ents.get(p.entity);
    const want = [...o.entity, ...(o.cell ? (["array", "grid"] as EType[]) : [])];
    if (!owner) return void err(path, "unknown_ref", `'${p.entity}' does not exist.`, hintFor(p.entity, want));
    if (p.kind === "entity") {
      if (!o.entity.includes(owner.type)) return void err(path, "wrong_target_type", `'${p.entity}' is a ${owner.type}; expected ${o.entity.join(" or ")}${o.cell ? " or a cell" : ""}.`);
      return p;
    }
    if (!o.cell) return void err(path, "wrong_target_type", `Cell reference '${ref}' is not allowed here; expected ${o.entity.join(" or ")}.`);
    if (p.kind === "range" && !o.range) return void err(path, "range_not_allowed", `Range '${ref}' is only allowed in 'targets'.`, "Use a single cell like 'nums#3'.");
    if (owner.type !== "array" && owner.type !== "grid") return void err(path, "wrong_target_type", `'${p.entity}' is a ${owner.type}, which has no cells.`);
    if (p.kind === "grid") {
      if (owner.type !== "grid") return void err(path, "wrong_target_type", `'${p.entity}' is an array; use '${p.entity}#<index>' not row.col.`);
      const g = doc.grids![owner.i]!;
      if (p.row >= g.rows.length || p.col >= g.rows[0]!.length)
        return void err(path, "cell_out_of_bounds", `Cell ${p.row}.${p.col} is outside the ${g.rows.length}×${g.rows[0]!.length} grid '${p.entity}'.`);
      return p;
    }
    if (owner.type !== "array") return void err(path, "wrong_target_type", `'${p.entity}' is a grid; use '${p.entity}#<row>.<col>'.`);
    if (p.kind === "range" && p.from > p.to) return void err(path, "bad_ref", `Range '${ref}' runs backwards.`, `Use '${p.entity}#${p.to}..${p.from}'.`);
    if (p.kind === "key") {
      const keys = doc.arrays![owner.i]!.keys;
      if (!keys?.includes(p.key))
        return void err(path, "unknown_ref", `Array '${p.entity}' has no key '${p.key}'.`, keys ? `Keys: ${keys.join(", ")}.` : `'${p.entity}' has no 'keys'; use an index.`);
    }
    // ponytail: index/range bounds depend on `values` actions over time — checked by the cell simulation (F03)
    return p;
  };

  // — structure: groups, edges, arrays/keys, tokens —
  const grp = (g: string | undefined, path: (string | number)[]) => g && expectId(g, ["group"], path);
  doc.nodes.forEach((n, i) => grp(n.group, ["nodes", i, "group"]));
  doc.arrays?.forEach((a, i) => {
    grp(a.group, ["arrays", i, "group"]);
    if (a.keys && a.keys.length !== a.values.length)
      err(["arrays", i, "keys"], "keys_length_mismatch", `'${a.id}' has ${a.keys.length} keys but ${a.values.length} values.`);
  });
  doc.grids?.forEach((g, i) => {
    grp(g.group, ["grids", i, "group"]);
    if (g.rows.some((r) => r.length !== g.rows[0]!.length)) err(["grids", i, "rows"], "schema", `Grid '${g.id}' rows must all have the same length.`);
  });
  doc.edges.forEach((e, i) => { expectId(e.from, ["node"], ["edges", i, "from"]); expectId(e.to, ["node"], ["edges", i, "to"]); });
  doc.tokens?.forEach((t, i) => expectRef(t.at, ["tokens", i, "at"], { entity: ["node"], cell: true }));

  // — scenarios: ids, branches —
  const scById = new Map<string, number>();
  const stepIds = new Map<string, string>();
  doc.scenarios.forEach((s, si) => {
    if (scById.has(s.id)) err(["scenarios", si, "id"], "duplicate_id", `Scenario id '${s.id}' is already used.`);
    else scById.set(s.id, si);
    s.steps.forEach((st, j) => {
      if (stepIds.has(st.id)) err(["scenarios", si, "steps", j, "id"], "duplicate_id", `Step id '${st.id}' is already used in scenario '${stepIds.get(st.id)}'.`);
      else stepIds.set(st.id, s.id);
    });
  });
  doc.scenarios.forEach((s, si) => {
    const b = s.branchFrom;
    if (!b) return;
    const base = ["scenarios", si, "branchFrom"];
    const pi = scById.get(b.scenario);
    if (pi === undefined) {
      const best = [...scById.keys()].map((c) => [c, lev(b.scenario, c)] as const).filter(([, d]) => d <= 2).sort((x, y) => x[1] - y[1])[0];
      return err([...base, "scenario"], "unknown_ref", `Scenario '${b.scenario}' does not exist.`, best ? `Did you mean '${best[0]}'?` : undefined);
    }
    if (!doc.scenarios[pi]!.steps.some((x) => x.id === b.afterStep)) {
      const ids = doc.scenarios[pi]!.steps.map((x) => x.id);
      return err([...base, "afterStep"], "unknown_branch_step", `Scenario '${b.scenario}' has no step '${b.afterStep}'.`, `Steps: ${ids.join(", ")}.`);
    }
    // cycle: walk parents
    const seen = new Set([s.id]);
    for (let cur = doc.scenarios[pi]!; ; ) {
      if (seen.has(cur.id)) return err([...base, "scenario"], "branch_cycle", `Scenario '${s.id}' branches from itself through '${cur.id}'.`);
      seen.add(cur.id);
      const nx = cur.branchFrom ? scById.get(cur.branchFrom.scenario) : undefined;
      if (nx === undefined) break;
      cur = doc.scenarios[nx]!;
    }
  });

  // — actions —
  const resolveEdge = (a: Extract<Action, { do: "send" }>, path: (string | number)[]) => {
    if (a.via !== undefined) {
      const e = edges.get(a.via);
      if (!e) return void err([...path, "via"], ents.has(a.via) ? "wrong_target_type" : "unknown_ref", `'${a.via}' is not an edge.`, hintFor(a.via, ["edge"]));
      if (!((e.from === a.from && e.to === a.to) || (e.from === a.to && e.to === a.from)))
        err([...path, "via"], "no_edge", `Edge '${a.via}' (${e.from}→${e.to}) does not connect '${a.from}' and '${a.to}'.`);
      return;
    }
    const match = (f: string, t: string) => [...edges].filter(([, e]) => e.from === f && e.to === t).map(([id]) => id);
    for (const ids of [match(a.from, a.to), match(a.to, a.from)]) {
      if (ids.length === 1) return;
      if (ids.length > 1) return void err(path, "ambiguous_edge", `Several edges connect '${a.from}' and '${a.to}': ${ids.join(", ")}.`, "Add 'via' with one of these edge ids.");
    }
    err(path, "no_edge", `No edge between '${a.from}' and '${a.to}'.`, "Add an edge to 'edges' or pick connected nodes.");
  };

  doc.scenarios.forEach((s, si) => s.steps.forEach((st, sj) => st.actions.forEach((a, k) => {
    const p: (string | number)[] = ["scenarios", si, "steps", sj, "actions", k];
    const multi = (types: EType[]) => a && "targets" in a && a.targets.forEach((t, n) => expectRef(t, [...p, "targets", n], { entity: types, cell: true, range: true }));
    switch (a.do) {
      case "state": return multi(["group", "node", "edge", "array", "grid", "token"]);
      case "show": case "hide": case "pulse": case "focus": return multi(ANY);
      case "label": expectRef(a.target, [...p, "target"], { entity: ["node", "edge", "group"], cell: true }); return;
      case "callout": expectRef(a.target, [...p, "target"], { entity: ANY, cell: true }); return;
      case "send":
        expectId(a.from, ["node"], [...p, "from"]); expectId(a.to, ["node"], [...p, "to"]);
        if (a.token !== undefined) expectId(a.token, ["token"], [...p, "token"]);
        if (ents.get(a.from)?.type === "node" && ents.get(a.to)?.type === "node") resolveEdge(a, p);
        return;
      case "move":
        expectId(a.token, ["token"], [...p, "token"]);
        expectRef(a.to, [...p, "to"], { entity: ["node"], cell: true });
        return;
      case "swap": {
        const x = expectRef(a.a, [...p, "a"], { entity: [], cell: true }), y = expectRef(a.b, [...p, "b"], { entity: [], cell: true });
        if (x && y && x.entity !== y.entity) err(p, "wrong_target_type", `'swap' needs two cells of the same array or grid, got '${x.entity}' and '${y.entity}'.`);
        return;
      }
      case "values": {
        if (expectId(a.target, ["array"], [...p, "target"]) !== "array") return;
        const keys = doc.arrays![ents.get(a.target)!.i]!.keys;
        if (keys && keys.length !== a.values.length)
          err([...p, "values"], "keys_length_mismatch", `'${a.target}' is keyed (${keys.length} keys) but 'values' has ${a.values.length} entries.`, "Keyed arrays keep a fixed length.");
        return;
      }
      case "highlight": expectId(a.target, ["code"], [...p, "target"]); return;
    }
  })));

  // — time-dependent checks: cell bounds per scenario, scenario duration —
  doc.scenarios.forEach((s, si) => {
    const dur = scheduleScenario(doc, s.id).duration;
    if (dur > MAX_DURATION) err(["scenarios", si], "limit_exceeded", `Scenario '${s.id}' runs ${dur.toFixed(1)}s; the limit is ${MAX_DURATION}s.`, "Trim steps, 'hold' or 'dur'.");
  });
  if (!issues.some((i) => i.severity === "error")) {
    const init = createCellSim(doc);
    doc.tokens?.forEach((t, i) => {
      const pr = parseRef(t.at)!;
      if ((pr.kind === "index" || pr.kind === "range") && !resolveCells(init, t.at))
        err(["tokens", i, "at"], "cell_out_of_bounds", `'${t.at}' is out of bounds: '${pr.entity}' has ${init.get(pr.entity)!.order.length} cells.`);
    });
    // ponytail: runs only on otherwise-valid docs, so refs are known to exist; re-simulates inherited steps per branch
    doc.scenarios.forEach((s) => {
      const sim = createCellSim(doc);
      for (const f of flattenScenario(doc, s.id)) {
        const si2 = doc.scenarios.findIndex((x) => x.id === f.scenario);
        f.step.actions.forEach((a, k) => {
          const p: (string | number)[] = ["scenarios", si2, "steps", f.index, "actions", k];
          let oob = false;
          for (const r of actionRefs(a)) {
            const pr = parseRef(r.ref)!;
            if (pr.kind === "entity" || pr.kind === "grid" || pr.kind === "key" || resolveCells(sim, r.ref)) continue;
            oob = true;
            if (!f.inherited) {
              const len = sim.get(pr.entity)!.order.length;
              err([...p, ...r.path], "cell_out_of_bounds", `'${r.ref}' is out of bounds: '${pr.entity}' has ${len} cell${len === 1 ? "" : "s"} at this point.`, "A 'values' action earlier in the scenario may have changed its length.");
            }
          }
          if (oob) return;
          if (a.do === "swap") applySwap(sim, a.a, a.b);
          else if (a.do === "values") applyValues(sim, a.target, a.values);
        });
      }
    });
  }

  const ok = !issues.some((i) => i.severity === "error");
  return ok ? { ok, issues, doc } : { ok, issues };
}
