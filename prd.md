# Product Requirements Document (PRD): FlowMotion Studio

**Agent-first platform for animated flow and algorithm explainers (Konva + Motion)**
Version 2.1 · 2026-11-18 · supersedes v1 (see Appendix A for what changed and why)

## 1. Executive Summary

**FlowMotion Studio** creates, shares, and exports **explainers**: step-by-step animated walkthroughs of
* **flows**: state machines, distributed workflows (Sagas, Temporal, retries, queues), request/auth flows;
* **algorithms and data structures**: searches and sorts over arrays, tree/graph traversals, DP tables, stacks/queues, neural-net forward/backward passes.

The primary author is an **AI agent**, reached mainly through an **MCP server**. A human states intent ("explain saga compensation when inventory fails", "walk through binary search for 23"), an agent produces a **FlowDoc**, and the platform handles layout, timing, styling, and rendering. Humans refine the result in a visual editor or by asking the agent for changes.

The core design rule: **agents write meaning, the compiler handles geometry and time.**

* **FlowDoc** (authored, stored): semantic JSON. It describes what exists (nodes, edges, lanes, arrays, grids) and what happens (scenarios → steps → actions). It holds no coordinates, absolute timestamps, colors, or shape choices unless a human pins them.
* **CompiledFlow** (derived, cached per revision): resolved positions, edge routes, absolute times, and keyframes. The viewer, editor preview, and video exporter consume only this.

The visual editor, the MCP server, and the REST API all change the same FlowDoc through the same validated operations.

---

## 2. Personas

1. **Agent author (primary).** An LLM in an MCP client (Claude, ChatGPT, VS Code Copilot, Cursor…), a coding agent with a shell using the CLI, or the in-app co-pilot. It needs a small schema, defaults for everything, machine-readable errors with fix hints, and a way to see its result.
2. **Technical creator (hybrid).** A developer advocate, instructor, or engineer who prompts for an 80% draft, then fixes wording, pins a node position, or adds a failure branch. Needs fast edits, undo, and a review of agent changes.
3. **Viewer / learner.** Reads an embedded explainer in docs, a course, a blog, or a PR. Steps forward and back, reads narration, watches variable values change, switches to "what if X fails?" branches, and deep-links to a step.

---

## 3. FlowDoc Schema (v2.1)

### 3.1 Design rules (they bind the schema, the API, and future changes)

1. **Semantic, not geometric.** Agents choose a node `kind` (service, db, queue…), not a shape, and a `state` (active, error…), not a color. A theme maps semantics to visuals.
2. **No required coordinates.** Layout is automatic (ELK). Optional `pos` exists only for human pins.
3. **No absolute time.** Actions run in sequence by default, steps run in order, and every duration has a default. Total duration is computed.
4. **Stable string IDs.** Kebab-case, unique across the whole document, so they can be read and referenced by agents (`inventory`, not `a7f3…`). Every reference is by ID or cell reference, never by array index into the document.
5. **Structured-output compatible.** Closed objects (`additionalProperties: false`), no open-ended maps (`Record<string, …>`), no recursion, and tagged unions on a single discriminator (`do`). The JSON Schema can be passed directly to strict structured-output / strict tool modes and to MCP tool `inputSchema`.
6. **One way to do each thing.** Each visual effect has exactly one action. Small vocabulary, hard limits.

### 3.2 Types

```typescript
export type Id = string;  // /^[a-z][a-z0-9-]{0,39}$/, unique document-wide
export type Ref = string; // an entity Id, or a cell reference:
                          //   "nums#3"     array cell by index
                          //   "nums#2..5"  inclusive range of array cells (in `targets` only)
                          //   "vars#lo"    array cell by key
                          //   "dp#1.2"     grid cell, row.col (0-based)

export type NodeKind = "service" | "state" | "decision" | "db" | "queue" | "actor" | "external" | "value";
export type StateName = "idle" | "active" | "success" | "error" | "warning" | "pending" | "disabled";

export interface FlowDoc {
  version: "2.1";
  meta: {
    title: string;                 // ≤ 80 chars
    summary?: string;              // ≤ 280 chars, shown on share cards
    theme?: "light" | "dark";      // default "light"
    aspect?: "16:9" | "4:3" | "1:1" | "9:16"; // default "16:9"
  };
  layout?: {
    algorithm?: "layered" | "tree" | "stress"; // default "layered"; "tree" for BSTs/heaps/recursion, "stress" for general graphs
    direction?: "LR" | "TB";       // default "LR" ("TB" recommended for trees)
  };
  groups?: Group[];
  nodes: Node[];
  edges: Edge[];
  arrays?: ArrayEntity[];
  grids?: GridEntity[];
  tokens?: Token[];
  code?: CodeBlock[];
  scenarios: Scenario[];           // ≥ 1; scenarios[0] is the default
}

export interface Group {           // swimlane, service boundary, NN layer
  id: Id;
  label: string;
}

export interface Node {
  id: Id;
  label: string;                   // ≤ 40 chars; wraps to 2 lines
  kind: NodeKind;                  // theme picks the shape: db → cylinder, decision → diamond, value → circle (tree/graph vertex, neuron)
  group?: Id;
  state?: StateName;               // initial state, default "idle"
  hidden?: boolean;                // initially hidden; revealed with `show`
  pos?: { x: number; y: number };  // human pin only; agents should omit
}

export interface Edge {
  id?: Id;                         // default `${from}-${to}`; required if duplicates exist
  from: Id;
  to: Id;
  label?: string;                  // ≤ 30 chars; edge weights, message names
  arrow?: boolean;                 // default true; false for undirected graphs
  dashed?: boolean;                // async / optional paths
  hidden?: boolean;
}

export interface ArrayEntity {     // arrays, stacks, queues, linked buffers, variable panels
  id: Id;
  label?: string;
  values: string[];                // ≤ 64 cells; "" renders an empty cell
  keys?: string[];                 // named cells (e.g. a variables panel: ["lo","mid","hi"]); default: index labels
  orientation?: "row" | "column";  // default "row"; "column" renders as a stack
  group?: Id;
  hidden?: boolean;
  pos?: { x: number; y: number };
}

export interface GridEntity {      // matrices, DP tables, boards, weight matrices
  id: Id;
  label?: string;
  rows: string[][];                // ≤ 16 × 16
  rowLabels?: string[];
  colLabels?: string[];
  group?: Id;
  hidden?: boolean;
  pos?: { x: number; y: number };
}

export interface Token {           // persistent marker: array pointer (lo/mid/hi), "current" cursor, workflow history head
  id: Id;
  label?: string;
  at: Ref;                         // node or cell it starts on; renders as a dot on nodes, a labeled pointer on cells
  hidden?: boolean;
}

export interface CodeBlock {
  id: Id;
  title?: string;
  language: string;                // shiki language id
  code: string;                    // ≤ 80 lines
  hidden?: boolean;
}

export interface Scenario {
  id: Id;
  title: string;                   // e.g. "Happy path", "What if inventory fails?", "Search for 40 (not found)"
  branchFrom?: { scenario: Id; afterStep: Id }; // inherits the parent's steps up to and including afterStep
  steps: Step[];                   // 1–40
}

export interface Step {
  id: Id;
  title: string;                   // ≤ 60 chars, shown in step list
  narration: string;               // required; ≤ 400 chars; plain text + `code` + **bold**
  actions: Action[];               // 0–12; 0 = narration-only step
  hold?: number;                   // seconds to linger after actions, default 1.5
}

type Timing = {
  start?: "after" | "with";        // default "after": runs when the previous action ends; "with": runs alongside it
  delay?: number;                  // seconds, default 0
  dur?: number;                    // seconds, per-action default (see 3.4)
  ease?: "linear" | "inOut" | "spring"; // default "inOut"
};

export type Action = Timing & (
  // — any entity or cell —
  | { do: "state"; targets: Ref[]; state: StateName }           // nodes, edges, groups, tokens, cells, cell ranges
  | { do: "show"; targets: Ref[] }
  | { do: "hide"; targets: Ref[] }
  | { do: "label"; target: Ref; text: string }                  // node label, edge label, or cell value: "retries: 2/3", "dp#1.2" = "3"
  | { do: "pulse"; targets: Ref[] }                             // brief attention bump, no state change (comparisons)
  | { do: "focus"; targets: Ref[]; dim?: boolean }              // camera fit (+ dim the rest); [] = full view
  | { do: "callout"; target: Ref; text: string }                // anchored note, ≤ 120 chars, lasts until step end
  // — motion —
  | { do: "send"; from: Id; to: Id; via?: Id; label?: string; token?: Id } // packet travels along an edge between nodes
  | { do: "move"; token: Id; to: Ref }                           // token jumps to any node or cell, no edge needed (pointers)
  // — data structures —
  | { do: "swap"; a: Ref; b: Ref }                               // two cells of the same array/grid exchange values, animated crossing
  | { do: "values"; target: Id; values: string[] }               // replace array contents; inserts/removals/changes animated (push, pop, enqueue, shift)
  // — code —
  | { do: "highlight"; target: Id; lines: string }              // code block; "3-5,9"; "" clears
);
```

### 3.3 Semantics

* **State persists.** `state`, `show`, `hide`, `label`, `highlight`, `focus`, `swap`, `values`, and token positions carry over to later steps until changed. `callout`, `pulse`, and ephemeral `send` packets end with their step.
* **`send`** moves a message between nodes. It animates a packet labeled `label` from `from` to `to`, and the traversed edge is `active` while the packet moves.
  * Edge resolution: `via` if given → the single edge `from→to` → the single edge `to→from` (traversed in reverse) → validation error. If several edges match, `via` is required.
  * If `token` is given, that persistent token moves instead and stays at `to`.
* **`move`** relocates a token to any node or cell along a short arc. Use it for pointers (lo/mid/hi, i/j, current vertex) where no edge exists.
* **Cells.** References are checked against the array's length *at that moment*: the compiler tracks `values` changes, so `stack#4` is valid only after a push makes the stack 5 long. Cell state survives `swap` (state moves with the value). `values` diffs old and new contents (LCS) so unchanged values stay in place.
* **Branches.** A scenario with `branchFrom` replays the parent up to `afterStep`, then plays its own steps. The viewer shows a branch button ("What if inventory fails?") on that step. Branches can nest. Cycles are a validation error.
* **Seeking is pure.** The visual state at time *t* is a function of (CompiledFlow, scenario, t) only. "Previous step" seeks to the start of that step. Nothing is replayed imperatively.

### 3.4 Timing defaults

| Action | Default `dur` |
|---|---|
| `send` | 1.2 s |
| `move`, `swap`, `focus`, `pulse` | 0.6 s |
| `values` | 0.5 s |
| `state`, `show`, `hide`, `label`, `highlight`, `callout` | 0.3 s |

Step duration = end of its last action + `hold`. Scenario duration = sum of its steps, including inherited ones.

### 3.5 Limits (Zod-enforced at every write boundary)

| Limit | Value |
|---|---|
| Entities (nodes + edges + groups + arrays + grids + tokens + code blocks) | ≤ 300 |
| Cells | ≤ 64 per array, ≤ 16 × 16 per grid |
| Scenarios | ≤ 8 |
| Steps per scenario | ≤ 40 |
| Actions per step | ≤ 12 |
| Scenario duration | ≤ 180 s |
| Document size | ≤ 1 MB |

These limits bound render-worker memory and runaway agent output. Readability at high entity counts is handled by lint warnings (§5.6) and `focus`, not by lower hard limits.

### 3.6 Examples (abridged, valid)

**Flow: saga with a failure branch**

```json
{
  "version": "2.1",
  "meta": { "title": "Saga: order checkout", "summary": "How an orchestrated saga commits, and how it compensates when a step fails." },
  "groups": [{ "id": "services", "label": "Services" }],
  "nodes": [
    { "id": "client", "label": "Client", "kind": "actor" },
    { "id": "orch", "label": "Order Saga", "kind": "service" },
    { "id": "payment", "label": "Payment", "kind": "service", "group": "services" },
    { "id": "inventory", "label": "Inventory", "kind": "service", "group": "services" }
  ],
  "edges": [
    { "from": "client", "to": "orch" },
    { "from": "orch", "to": "payment" },
    { "from": "orch", "to": "inventory" }
  ],
  "scenarios": [
    { "id": "happy", "title": "Happy path", "steps": [
      { "id": "checkout", "title": "Checkout", "narration": "The client places an order. The saga orchestrator now owns the transaction.",
        "actions": [
          { "do": "send", "from": "client", "to": "orch", "label": "PlaceOrder" },
          { "do": "state", "targets": ["orch"], "state": "active" } ] },
      { "id": "charge", "title": "Charge card", "narration": "Step 1: charge the card. This is a local transaction in Payment.",
        "actions": [
          { "do": "send", "from": "orch", "to": "payment", "label": "Charge" },
          { "do": "state", "targets": ["payment"], "state": "success" } ] },
      { "id": "reserve", "title": "Reserve stock", "narration": "Step 2: reserve stock. Both steps committed, so the saga completes.",
        "actions": [
          { "do": "send", "from": "orch", "to": "inventory", "label": "Reserve" },
          { "do": "state", "targets": ["inventory", "orch"], "state": "success" } ] }
    ]},
    { "id": "inventory-fails", "title": "What if inventory fails?",
      "branchFrom": { "scenario": "happy", "afterStep": "charge" },
      "steps": [
        { "id": "reserve-fails", "title": "Reservation fails", "narration": "Inventory is out of stock and rejects the reservation.",
          "actions": [
            { "do": "send", "from": "orch", "to": "inventory", "label": "Reserve" },
            { "do": "state", "targets": ["inventory"], "state": "error" },
            { "do": "send", "from": "inventory", "to": "orch", "label": "OutOfStock" } ] },
        { "id": "refund", "title": "Compensate", "narration": "There is no distributed rollback. The saga runs **compensations** in reverse order: refund the charge.",
          "actions": [
            { "do": "send", "from": "orch", "to": "payment", "label": "Refund" },
            { "do": "state", "targets": ["payment"], "state": "warning" },
            { "do": "callout", "target": "payment", "text": "Compensation is a new transaction, not an undo", "start": "with" } ] }
      ]}
  ]
}
```

**Algorithm: binary search with pointers and a variables panel**

```json
{
  "version": "2.1",
  "meta": { "title": "Binary search for 23" },
  "nodes": [], "edges": [],
  "arrays": [
    { "id": "nums", "values": ["2","5","8","12","16","23","38","56","72","91"] },
    { "id": "vars", "label": "Variables", "keys": ["lo","mid","hi"], "values": ["0","4","9"] }
  ],
  "tokens": [
    { "id": "lo", "label": "lo", "at": "nums#0" },
    { "id": "mid", "label": "mid", "at": "nums#4" },
    { "id": "hi", "label": "hi", "at": "nums#9" }
  ],
  "scenarios": [{ "id": "main", "title": "Find 23", "steps": [
    { "id": "probe-1", "title": "Probe index 4", "narration": "mid = (0 + 9) / 2 = 4. nums[4] = 16 < 23, so discard the left half.",
      "actions": [
        { "do": "pulse", "targets": ["nums#4"] },
        { "do": "state", "targets": ["nums#0..4"], "state": "disabled" },
        { "do": "move", "token": "lo", "to": "nums#5" },
        { "do": "label", "target": "vars#lo", "text": "5", "start": "with" } ] },
    { "id": "probe-2", "title": "Probe index 7", "narration": "mid = (5 + 9) / 2 = 7. nums[7] = 56 > 23, so discard the right half.",
      "actions": [
        { "do": "move", "token": "mid", "to": "nums#7" },
        { "do": "label", "target": "vars#mid", "text": "7", "start": "with" },
        { "do": "state", "targets": ["nums#7..9"], "state": "disabled" },
        { "do": "move", "token": "hi", "to": "nums#6" },
        { "do": "label", "target": "vars#hi", "text": "6", "start": "with" } ] },
    { "id": "found", "title": "Found", "narration": "mid = (5 + 6) / 2 = 5. nums[5] = 23. Found in 3 probes instead of up to 10.",
      "actions": [
        { "do": "move", "token": "mid", "to": "nums#5" },
        { "do": "label", "target": "vars#mid", "text": "5", "start": "with" },
        { "do": "state", "targets": ["nums#5"], "state": "success" } ] }
  ]}]
}
```

---

## 4. Compiler & Runtime

### 4.1 Pipeline

`FlowDoc → validate → layout → resolve timing → CompiledFlow` (one pure function, same code in the browser, Node, and the CLI).

* **Validate:** Zod schema, then semantic checks (§5.6).
* **Layout:** `elkjs` with the doc's `algorithm` (layered + orthogonal routing, `mrtree`, or `stress` with a fixed seed). Groups become ELK compound nodes (lanes, layers). Arrays and grids are fixed-size ELK nodes. Pinned `pos` values are fixed constraints. Node sizes come from `kind` plus label width, measured with a precomputed glyph-width table for the bundled font, so compilation is identical with or without a DOM.
* **Timing:** expand branches, resolve `start`/`delay`/`dur` into absolute keyframes per entity property, and simulate array contents over time to validate cell references.
* **Output:** `CompiledFlow` = positions, edge polylines, and per-scenario keyframe tracks. It is cached per document revision. The viewer and exporter load only this, so the viewer bundle ships without ELK and without Zod.

### 4.2 Playback

* `sample(compiled, scenario, t) → FrameState` is a pure function. It interpolates keyframes and computes packet positions along edge polylines by arc-length.
* **Motion** drives the clock and easing. A single `MotionValue` for `t`, animated by `animate()`, provides play/pause/speed/seek. Its `onChange` calls `sample()` and writes to Konva node refs with `setAttrs()` and `layer.batchDraw()`, with no React reconciliation per frame. Easing and spring curves come from Motion's duration-based easing functions, so springs are deterministic and end on time.
* **Determinism:** no `Date.now()`, `Math.random()`, or physics stepping in `sample()`. Fonts (Inter, JetBrains Mono) are bundled and `document.fonts.ready` is awaited before first draw. The guarantee is **identical frame state** for a given *t* everywhere. Pixel identity is only guaranteed between export runs (fixed DPR in headless Chromium).
* **Reduced motion:** with `prefers-reduced-motion`, `send`/`move`/`swap` crossfade instead of traveling and `pulse` is skipped.

### 4.3 Performance

60 fps for a document at the limits in §3.5 (300 entities plus cells) on a mid-range laptop. Viewer embed ≤ 150 KB gzipped JS excluding fonts.

---

## 5. Agent Interface (MCP-first)

### 5.1 MCP viability assessment

**Verdict: viable. MCP should be the primary agent surface,** with REST underneath and a CLI for agents that have a shell.

Why it fits:
* **Reach.** One remote server works in Claude (web, desktop, Code), ChatGPT, VS Code Copilot, Cursor, Goose, and others. Most of these also render **MCP Apps** UI resources, so the explainer can **play inline in the chat**, with a plain-text fallback required for other clients.
* **Cost.** On the MCP path the user's client pays for the LLM. We pay only for compile, preview, and export.
* **Shape of the work.** The job is "produce one validated JSON document, then iterate on it". That is a natural fit for tool calls. Server-side validation with fix hints turns into a tight self-repair loop inside the client's agent.
* **Statelessness.** All state lives in the document and its revision IDs. That matches the stateless protocol introduced in the 2026-07-28 MCP spec: no session affinity, and the server scales horizontally like the REST API.

Risks and mitigations:

| Risk | Mitigation |
|---|---|
| Large tool inputs. A 300-entity doc is roughly 60–100 KB of JSON (~20–30K tokens), and one invalid call wastes all of it. | Guide recommends building incrementally above ~40 entities: create the structure, then add scenarios with batched `flow_edit`. Validation returns **all** errors at once, never just the first. Every write returns a compact outline so the agent never has to re-read the full doc. |
| Client JSON-Schema support varies (unions, `$ref`, large schemas). | `inputSchema` is fully inlined (no `$ref`), with one discriminated union (`do`). Server validation is the source of truth. A client compatibility matrix is part of the Phase 1 exit gate (§5.5). |
| Not every client shows or uses images from tool results. | `flow_preview` returns image + text (outline, lint) + viewer URL. |
| Video export takes minutes, longer than tool-call timeouts. | `flow_export` returns a job ID and `flow_job` polls it. Use the MCP Tasks extension where the client declares it, with the synchronous job-poll fallback otherwise. |
| Tool descriptions consume context on every turn. | ≤ 10 tools with short descriptions. The full authoring guide is fetched on demand via `flow_guide`, not embedded in descriptions. |
| Prompt injection through user-authored text (public flows, remixes) that an agent reads. | Tool results mark narration and labels as user data. Featured templates are curated. |
| Concurrent human + agent edits. | `baseRevision` on every edit → `409` with the current outline. The editor streams agent revisions live (SSE). |
| Protocol churn (stateless rewrite in 2026-07-28; Sampling, Roots, Logging deprecated). | Use the official TypeScript SDK. Depend only on tools, structured tool output, image content, and the Apps and Tasks extensions with fallbacks. Never depend on sampling. |

### 5.2 Deployment

* **Remote MCP server** at `/mcp` on the API host: Streamable HTTP, stateless. **No auth**: the endpoint is public, so claude.ai / ChatGPT connectors need no authorization.
* **No local stdio MCP server in v2.** Coding agents with a shell use the CLI (`validate`, `preview`, `render` write files they can read back). Add stdio only if a shell-less client needs offline use.
* **In-app co-pilot** calls the same tool implementations in-process: one tool surface, one eval suite.

### 5.3 Tools

| Tool | Hints | Purpose |
|---|---|---|
| `flow_guide()` | read-only | Authoring guide (Markdown), the inlined JSON Schema, and the template list with IDs. Description says "call before creating". Also served at `/llms.txt` and `/schema/flow-2.1.json`. |
| `flow_list({ query? })` | read-only | The caller's flows and public templates (ID, title, updated). Used for "update my saga explainer". |
| `flow_get({ id, view, ids? })` | read-only | `view: "outline"` is a compact text summary (entities, edges, scenario/step titles with IDs). `"full"` is the FlowDoc. `ids` returns only those entities/steps. |
| `flow_create({ doc, dryRun? })` | | Validate (and save unless `dryRun`). |
| `flow_edit({ id, baseRevision, ops })` | | Apply ID-addressed ops atomically (§5.7). |
| `flow_revert({ id, toRevision })` | | Restore an earlier revision (as a new revision, so nothing is lost). |
| `flow_preview({ id, scenario?, step? })` | read-only | PNG of the end-of-step frame, or a **contact sheet** (every step's end frame with titles, ≤ 1600 px long edge) when `step` is omitted, so the agent checks the whole explainer in one call. |
| `flow_export({ id, scenario, format })` | | `mp4` / `webm` / `gif` render job. |
| `flow_job({ jobId })` | read-only | Job status, progress, and download URL. |

* Every write returns structured content (`id`, `revision`, `url`, `errors`, `warnings`, `outline`) with a declared output schema, plus a text rendering of the same data for clients that ignore structured output.
* Validation failures come back as a tool error result with the full error list, never as a protocol error, so the model can read and fix them.
* **MCP App:** create/edit/preview results reference a `ui://flowmotion/player` resource. Supporting clients render the interactive player inline (step controls, branch buttons, "Open in editor"). Others get the URL.
* **MCP prompt:** `explain` (`topic`, `audience?`) seeds the recommended workflow below. Clients that support prompts show it as a slash command.

### 5.4 Recommended agent workflow (taught by `flow_guide` and the `explain` prompt)

1. `flow_guide` once per session. Optionally `flow_get` the closest template as an example.
2. Plan: entities, scenarios (happy path + the failure or edge cases worth showing), step titles.
3. Small flows (≲ 40 entities): `flow_create` with the full doc. Large flows: `flow_create` with entities and the first scenario, then one `flow_edit` per remaining scenario.
4. Fix every reported error in one follow-up call.
5. `flow_preview` (contact sheet). Fix layout, clarity, and lint warnings with `flow_edit`.
6. Give the user the viewer URL.

### 5.5 Viability gate (Phase 1 exit)

An eval of 20 topic prompts (10 flows, 10 algorithms/data structures) across 3 clients (Claude Code, Claude web/desktop, and one non-Anthropic client such as ChatGPT or Cursor). Pass criteria:

* ≥ 90% reach a valid doc within 3 create/edit calls.
* Median ≤ 6 tool calls per finished explainer.
* Median human clarity rating ≥ 4/5.
* No client fails to load or call the tools because of schema shape.

If the gate fails, simplify the schema or tool shapes before starting Phase 2.

### 5.6 Validation output (designed for self-repair)

Every error and warning has the same shape:

```json
{ "severity": "error", "code": "unknown_ref",
  "path": "/scenarios/1/steps/0/actions/2/to", "where": "inventory-fails › reserve-fails › action 3",
  "message": "Node 'inventry' does not exist.", "hint": "Did you mean 'inventory'?" }
```

**Errors** (block save): schema violations, unknown references, duplicate IDs, cell reference out of bounds at that point in time, wrong target type (`highlight` on a non-code entity, `swap` across two different arrays, `values` on a grid), no edge for a `send`, ambiguous edge without `via`, branch cycles or a missing `afterStep`, and limits exceeded.

**Warnings** (explainer-quality lint, never block):
* step with no visible change and narration under 40 chars
* narration over 280 chars (it will be cut off in video captions)
* more than 7 entities revealed in one step (break it up)
* entity never visible, or declared but never referenced
* label wraps past 2 lines
* more than 15 nodes visible with no `focus` in the scenario
* a pinned `pos` overlaps another node

### 5.7 Edit ops

ID-addressed, never index-addressed. They are batched and applied atomically: the batch either fully validates or nothing changes.

```typescript
type Op =
  | { op: "upsert"; entity: "node" | "edge" | "group" | "array" | "grid" | "token" | "code"; value: object } // replace by id, or insert
  | { op: "remove"; id: Id; cascade?: boolean }   // without cascade, fails if referenced (error lists referrers)
  | { op: "upsertStep"; scenario: Id; after?: Id; value: Step } // after omitted = append; existing id = replace in place
  | { op: "removeStep"; scenario: Id; step: Id }
  | { op: "upsertScenario"; value: Scenario }
  | { op: "removeScenario"; id: Id }
  | { op: "setMeta"; value: Partial<FlowDoc["meta"]> & { layout?: FlowDoc["layout"] } };
```

Internally, each applied batch is stored as an Immer patch pair (forward and inverse) for undo/redo and history. The editor uses the same op set.

### 5.8 In-app generation pipeline

1. **Generate:** prompt + `flow_guide` content + the 1–2 closest templates as examples → the model emits a FlowDoc via structured outputs (Zod 4 `z.toJSONSchema()` of the schema). Default model: `claude-opus-5-5`, streamed.
2. **Repair loop:** compile. If there are errors, send them back verbatim (§5.6 shape) and ask for a corrected doc. At most 3 rounds, then show the partial result with the errors.
3. **Visual self-check (on by default for new flows):** render the contact sheet, give it to the model with the lint warnings, and accept at most one revision via edit ops.
4. **Conversational edits:** the model receives the outline plus the full JSON of only the entities and steps the user selected, and replies with edit ops (§5.7). Each AI batch lands as **one undo entry** labeled with the request, and the changed entities are highlighted in the editor.

Constraint: do not rely on forced tool choice. Use structured outputs, or `auto` tool choice with strict tool schemas.

---

## 6. Viewer & Sharing

* **Share link** `/v/:slug` and embed as `<iframe>` or the `<flow-player src="…">` web component. The player loads `CompiledFlow` JSON (or a `.flow.json`, compiled client-side, via a lazy-loaded compiler).
* **Modes:** *Step* (default for embeds): advances on click or key, narration card per step. *Play*: continuous playback with a scrub bar and 0.5×–2× speed.
* **Navigation:** step list (table of contents), ← / → keys, branch buttons at branch points, scenario switcher.
* **Deep links:** `?s=<scenario>&step=<stepId>` (stable because IDs are stable).
* **Accessibility:** narration lives in an `aria-live` region. Every step is reachable by keyboard. The step list doubles as a text transcript. Array and grid values are exposed as accessible tables.
* **Remix:** clones any shared flow into the viewer's local library.

---

## 7. Visual Editor (`react-konva`)

The editor refines agent output. It is not the primary authoring path.

* **Canvas:** pan/zoom stage, entity palette (node kinds, array, grid, token, code), and drag to connect nodes into edges.
* **Dragging a node, array, or grid** sets `pos` (pins it) and re-routes its edges live. **"Re-layout"** clears every pin.
* **Inspector:** label, kind, group, initial state, hidden, and inline cell editing for arrays and grids, plus a theme preview of every `StateName`.
* **Step editor:** a step list with narration fields, and a per-step timeline that shows actions as bars. Dragging a bar edits `delay` / `dur`. Toggling sequence/parallel edits `start`. Clicking the playhead seeks.
* **AI panel:** prompt box (generate / edit selection) and a revision history showing author (user or agent) with one-click revert.
* **Undo/redo:** via the op patch stack (§5.7).

---

## 8. Video Export

* Worker: Playwright (headless Chromium, fixed DPR) opens `/render/:revision?s=<scenario>`, then for each frame *i* in `0 … duration×fps`: `window.__PLAYER__.seek(i / fps)` → await draw → capture `stage.toCanvas()` pixels. Frames are piped to FFmpeg (`libx264`, `yuv420p`, or VP9 for WebM, palettegen for GIF).
* Options: 1080p/720p, 30/60 fps, **burned-in narration captions** (on by default) and a step title bar.
* Output goes to R2/S3. Completion is reported via SSE/webhook and `flow_job`.
* Export applies to one scenario per file. Exporting a branch includes its inherited steps.

---

## 9. Non-Functional Requirements

* **Trust boundary:** every FlowDoc from an agent or user is untrusted. It is Zod-validated on every write, limits are enforced (§3.5), text renders as canvas text or escaped DOM (narration supports only `code` and **bold**), and no URLs or HTML are allowed in the doc.
* **No accounts, no login, no API keys.** MCP and REST are public. Rate limits (per IP) on generation, preview, and export.
* **Storage:** PostgreSQL. `flows` (current doc, JSONB) plus an append-only `flow_revisions` table (ops, inverse ops, author type: user / in-app agent / MCP client, prompt if known). `CompiledFlow` is cached by revision.
* **Versioning:** `version` field. Breaking schema changes ship a migrator, and old docs load forever.

## 10. Success Metrics

* MCP path: share of explainers that reach a valid doc within 3 calls (target ≥ 90%), median tool calls per finished explainer (≤ 6), weekly active MCP clients.
* In-app path: ≥ 90% of generations valid on the first pass; ≥ 99% after ≤ 3 repair rounds.
* ≤ 1 lint warning per generated flow (median).
* Median prompt → first playable preview ≤ 30 s.
* Hybrid users: median manual edits after generation (lower is better; tracks how often the agent's draft is usable as is).
* Viewers: share of sessions that reach the last step.

## 11. Tech Stack

* React 19 + TypeScript + Tailwind; `konva` + `react-konva`; `motion` (clock + easing only).
* `elkjs` (layout, compiler only); `zod` v4 (schema + `z.toJSONSchema`); `zustand` + `immer` (state + patches); `shiki` (code highlighting).
* Node API (shares the compiler package with the frontend, CLI, and MCP server); official MCP TypeScript SDK; PostgreSQL; R2/S3.
* Render worker: Playwright + FFmpeg.

## 12. Roadmap (agent path first)

**Phase 1: Schema, compiler, viewer, MCP (weeks 1–3)**
* FlowDoc Zod schema, validator + lint, compiler (ELK layout, timing, cell simulation, `sample()`), Konva player with step/play modes.
* Remote MCP server + REST: `flow_guide`, `flow_list`, `flow_get`, `flow_create`, `flow_edit`, `flow_revert`, `explain` prompt. CLI `validate`.
* Authoring guide + 7 templates that double as few-shot examples. Flows: **circuit breaker** (state machine), **saga with compensation branch**, **Temporal replay after worker crash**, **retry with exponential backoff → DLQ**, **OAuth 2.0 auth code + PKCE**. Algorithms: **binary search**, **backpropagation through a small network**.
* Exit: viability gate (§5.5).

**Phase 2: Preview, inline player, in-app generation, sharing, export (weeks 4–5)**
* `flow_preview` with contact sheets; MCP App inline player.
* In-app generation pipeline (§5.8) with repair loop and visual self-check.
* Share links, `<flow-player>` embed, deep links, remix.
* Export worker (MP4/WebM/GIF with captions); `flow_export`, `flow_job` (with MCP Tasks where supported); CLI `preview` / `render`.

**Phase 3: Visual editor (weeks 6–8)**
* Konva editor, inspector with cell editing, step/timeline editor, AI panel with revision history and revert.

## 13. Non-Goals (v2)

* Sequence-diagram layout (lifelines). Lanes cover most cases. Candidate for a later version as `layout.algorithm: "sequence"`.
* Free-form drawing, rotation, custom shapes, per-entity colors.
* Voice-over/TTS. Narration text is already shaped for it.
* Real-time multi-user co-editing. Optimistic `baseRevision` concurrency only.
* Local stdio MCP server and MCP sampling-based generation (§5.2, §5.1).

---

## Appendix A: v1 → v2 Review Findings

| # | v1 issue | Impact on agents / explainers | v2 change |
|---|---|---|---|
| 1 | Required `x, y, width, height` on nodes | LLMs produce overlapping, unbalanced layouts. This is the most common failure. | Auto layout (ELK: layered, tree, stress). `pos` optional, used for human pins only. |
| 2 | Absolute `startTime` per step, plus `meta.duration` | Three redundant time sources that agents get inconsistent. Tracks had no offset/duration of their own. | Relative sequencing (`start`/`delay`/`dur`) with defaults. Totals computed. |
| 3 | `initialState` + `stateStyles: Record<…>` required on every entity | Huge token cost, repeated style dicts, and `Record` breaks strict structured outputs. | Fixed `StateName` enum styled by the theme. |
| 4 | Moving packets need pre-declared tokens + `attachedEdgeId` + `traverseEdge` progress | Several coordinated objects for the most common explainer beat. | One `send { from, to, label }` action; `move` for pointers. |
| 5 | JSON Patch (RFC 6902) for agent edits | Index paths (`/entities/3`) are brittle and break after any insert. | ID-addressed ops, atomic, with `baseRevision`. Immer patches only for internal undo. |
| 6 | `CodeBlockEntity` referenced but never defined | Schema did not compile. | `CodeBlock` defined, `highlight` with line ranges. |
| 7 | No failure branches | Failure paths are the point of saga/Temporal/retry explainers. | `scenarios` + `branchFrom`, branch buttons in the viewer. |
| 8 | No camera, spotlight, or live values | Large diagrams are unreadable, and "inspect variable states" had no mechanism. | `focus` (+ dim), `label` (live values, cell writes), `callout`, `pulse`, keyed-array variable panels. |
| 9 | No lanes/boundaries | Distributed flows are hard to read without service boundaries. | `groups` → ELK compound nodes. |
| 10 | Narration optional | Explainers without narration are just animations. | `narration` required per step, length-linted. |
| 11 | Validation = schema only | Agents could not self-correct reference or semantic errors. | Semantic errors + quality lint with path, ID-based location, and hint. |
| 12 | Agent tools too granular (`add_entity`, `connect_nodes`, …), MCP only mentioned | Dozens of round-trips per flow; no plan for auth, large inputs, long jobs, or client differences. | MCP-first design (§5): viability assessment, whole-doc create + batched ops, outline view, visual preview, inline MCP App player, jobs/Tasks for export, Phase 1 viability gate. |
| 13 | Motion `animate()` per property as the source of truth | Seeking and backward stepping across many animations is fragile. | Pure `sample(t)`. Motion drives only the clock and easing. |
| 14 | "Pixel-identical" across interactive and export | Not achievable across DPR/GPU. | Guarantee identical frame state, and pixel identity only between export runs. |
| 15 | Limit 300 entities vs. perf target 150 | Inconsistent. | Limit stays 300; perf target raised to 300 to match. |
| 16 | Algorithms/data structures in scope but no entities for them | Arrays, pointers, DP tables, and stacks could only be faked with positioned nodes. | `arrays` (incl. keyed variable panels, stacks), `grids`, cell references and ranges, pointer tokens, `move` / `swap` / `values` actions, `tree`/`stress` layouts, undirected edges. |
| 17 | Editor built before agent path | Delays the primary authoring path by ~5 weeks. | Roadmap reordered: MCP + compiler in Phase 1, editor in Phase 3. |
