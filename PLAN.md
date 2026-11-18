# FlowMotion Studio — Implementation Plan

Source of truth for product behavior: [`prd.md`](./prd.md) (v2.1). This file turns it into ordered,
independently committable features for implementing agents. When this plan and the PRD disagree on
*behavior*, the PRD wins; when the PRD is silent, this plan's decisions win (§0.3).

---

## 0. Rules for implementing agents

### 0.1 Workflow per feature

1. Pick the **first unchecked feature** whose `Depends` are all checked (`[x]`). Several agents may work in
   parallel on features whose dependencies are met — claim one by changing `[ ]` to `[~]` and committing
   that one-line change (`chore(plan): claim F07`) before starting.
2. Read the PRD sections listed under `PRD`. Read the code the feature touches. Reuse what exists.
3. Implement. Leave the **check** listed under `Done when` (a Vitest test unless stated otherwise).
4. Run from the repo root: `pnpm typecheck && pnpm test`. Both must pass. Never commit red.
5. Tick the box (`[~]` → `[x]`) in this file in the same commit.
6. **Commit once per feature**, Conventional Commits, scope = package:
   `feat(core): F05 ELK layout with groups and pins`. Body: what was skipped/deferred, if anything.
   Do not push unless told to. Never commit secrets (`.env` is gitignored; use `.env.example`).
7. If a feature turns out too large, split it into `F07a`/`F07b` in this file and commit each.
8. If you must deviate from this plan, edit the plan in the same commit and say why in the body.

### 0.2 Engineering rules

* Minimum code that satisfies the PRD. No speculative abstraction, no unused config, no new
  dependency where a few lines do. Mark deliberate shortcuts with a `ponytail:` comment naming the
  ceiling and the upgrade path.
* Everything that touches a FlowDoc goes through `@flowmotion/core`. The server, CLI, editor and
  co-pilot never reimplement validation, ops or compilation.
* `@flowmotion/core/runtime` (types, theme, `sample()`, easing) must not import `zod`, `elkjs` or
  `shiki` — the viewer bundle depends on it (PRD §4.1, §4.3). A test enforces this (F08).
* Determinism: no `Date.now()`, `Math.random()`, or iteration over unordered sources in the compiler or
  `sample()`. ELK `stress` uses a fixed seed.
* Untrusted input: every FlowDoc and op batch is Zod-validated at every write boundary. Narration is
  rendered via `textContent`/canvas text only — never `innerHTML`.
* Pin exact dependency versions (current stable at install time). Node ≥ 22 (dev box has 26), pnpm.

### 0.3 Decisions the PRD leaves open (defaults — change only with a plan edit)

| Topic | Decision |
|---|---|
| Repo | pnpm workspace monorepo, TypeScript strict, ESM only, Vitest. No ESLint/Prettier config beyond defaults. |
| HTTP server | Express 5 (matches official MCP TS SDK examples). One process serves REST, `/mcp`, and the built web app. |
| Storage | **No database, no accounts, no auth (decided after F13 v1).** The server is stateless. Users' flows live **locally** in the browser (IndexedDB; undo history and revision snapshots too). Sharing = `POST /api/share` (public, IP rate-limited): validate + compile, write one immutable JSON `{doc, compiled}` to a `BlobStore` under a random id. Prod = Cloudflare R2 through the S3 API (`@aws-sdk/client-s3`); dev/tests = local dir / in-memory. Nothing is ever edited in place: every publish is a new id. |
| Flow IDs | Shared snapshots get a 12-char random lowercase base32 id (`crypto.randomBytes`), used by `flow_get({id})`, `/api/share/:id` and `/v/:id`. The link is the capability (unlisted, immutable). Local flows have their own client-side ids. |
| Revisions | Client-side only (IndexedDB snapshots + op-batch undo). The server has no revision counter. Render route is `/render/:id` (shared id; local previews post the doc). |
| Jobs | In-process queue + in-memory job map, output written to the `BlobStore`. `ponytail:` jobs are lost on restart; add a durable queue only if exports must survive deploys. |
| Blob storage | `BlobStore { put(key, body), get(key) }` with R2 (S3 API) when `R2_BUCKET` is set, else `./data/blobs` (dev), in-memory (tests). |
| Web routing | Vite + React 19 + Tailwind. ≤ 6 routes → a `switch` on `location.pathname`, no router library. |
| Player architecture | **Framework-free** Konva player (`createPlayer(el, compiled)`) + `<flow-player>` custom element. React app wraps it. Keeps embed ≤ 150 KB gz (React not in the embed). Editor (Phase 3) reuses the player's `drawEntity` functions under react-konva. |
| Code highlighting | Done by the **compiler** (shiki `codeToTokens`), so compiled code blocks carry colored tokens and the viewer never ships shiki. |
| CLI `preview`/`render` | Call the public REST API (`FLOWMOTION_API_URL`); `validate` is fully local. Local files, no keys. |
| Rate limiting | In-memory fixed window per client IP (`ponytail:` per-process; move to the edge/Cloudflare rules when >1 instance). Tight on `POST /api/share`, `/ai`, export. |
| Schema migrations | Only `"2.1"` exists. `migrate(doc)` is a pass-through that rejects other versions with a clear error. Real migrators ship with the first breaking change. |

Env vars (documented in `.env.example`): `PUBLIC_URL`, `ANTHROPIC_API_KEY`, `R2_BUCKET`, `R2_ENDPOINT`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `RATE_LIMIT`.

### 0.4 Repo layout (target)

```
flowmotion/
  package.json  pnpm-workspace.yaml  tsconfig.base.json  vitest.config.ts  .env.example
  assets/fonts/            Inter + JetBrains Mono (OFL), .woff2 for web, .ttf for glyph-table generation
  templates/*.flow.json    7 templates (F10) — few-shot examples + seeded public flows
  docs/guide.md            authoring guide served by flow_guide and /llms.txt (F10)
  schema/flow-2.1.json     generated by `pnpm gen:schema` (F01)
  evals/                   viability-gate prompts, runner, results (F19)
  packages/
    core/     schema, validate, cells, timing, measure, theme, layout, compile, lint, ops, outline
              exports: "."  (compiler, Node + browser)   "./runtime" (types, theme, sample, ease)
    player/   Konva player, <flow-player> element
    server/   Express (stateless): REST, MCP, share/blob store, jobs, generation
    worker/   Playwright + FFmpeg render worker (stills, contact sheets, video)
    cli/      `flowmotion` binary
    web/      Vite React app: dashboard, viewer, embed, render page, editor
```

Create a package only when the first feature that needs it starts.

---

## 1. Shared contracts (implement exactly; extend only by editing this section)

### 1.1 CompiledFlow (`packages/core/src/compiled.ts`, exported from `./runtime`)

```ts
export type Rect = { x: number; y: number; w: number; h: number };
export type Ease = "linear" | "inOut" | "spring";

export interface CompiledFlow {
  version: "2.1";
  meta: { title: string; summary?: string; theme: "light" | "dark"; aspect: "16:9" | "4:3" | "1:1" | "9:16" };
  bounds: Rect;                                    // whole diagram incl. hidden entities
  groups: { id: string; label: string; rect: Rect }[];
  nodes:  { id: string; kind: NodeKind; rect: Rect }[];             // shape comes from theme by kind
  edges:  { id: string; from: string; to: string; arrow: boolean; dashed: boolean;
            points: number[];                        // polyline [x0,y0,x1,y1,…]
            length: number; labelAt: { x: number; y: number } }[];
  arrays: { id: string; label?: string; rect: Rect; orientation: "row" | "column";
            keys?: string[]; slots: Rect[] }[];      // slot rects sized for the MAX length across all scenarios
  grids:  { id: string; label?: string; rect: Rect; rows: number; cols: number;
            rowLabels?: string[]; colLabels?: string[]; slots: Rect[] }[]; // row-major
  code:   { id: string; title?: string; rect: Rect; lines: { text: string; color: string }[][] }[];
  tokens: { id: string; label?: string }[];
  scenarios: CompiledScenario[];
}

export interface CompiledScenario {
  id: string; title: string; duration: number;
  steps: { id: string; title: string; narration: string; start: number; end: number;
           inherited: boolean; branches: { scenario: string; title: string }[] }[];
  cells: { id: string; owner: string }[];   // cell instances, e.g. "nums@3" owned by "nums" (see 1.2)
  tracks: Track[];
  packets:  { edge: string; reverse: boolean; t0: number; t1: number; ease: Ease; label?: string }[];
  pulses:   { target: string; t0: number; t1: number }[];
  callouts: { target: string; text: string; t0: number; t1: number }[];
  camera:   { t0: number; t1: number; ease: Ease; rect: Rect | null; dim: string[] }[]; // null = full view
}

export type TrackProp = "state" | "visible" | "label" | "slot" | "at" | "lines";
export type TokenAt = { target: string } | { edge: string; reverse: boolean }; // node id, cell instance id, or riding an edge
export interface Track {
  target: string;                 // entity id or cell instance id
  prop: TrackProp;
  init: StateName | boolean | string | number | TokenAt;
  keys: { t0: number; t1: number; ease: Ease; to: Track["init"] }[]; // sorted, non-overlapping per track
}
```

`sample(compiled, scenarioId, t, opts?: { reducedMotion?: boolean }) → FrameState` (in `./runtime`):

```ts
export interface FrameState {
  t: number; step: number;                         // index into scenario.steps
  ents: Map<string, {                              // every entity + cell instance present in the scenario
    opacity: number;                               // from `visible`
    state: StateName; fromState: StateName; stateK: number;   // color = mix(theme[fromState], theme[state], stateK)
    label?: string; fromLabel?: string; labelK?: number;      // crossfade
    x?: number; y?: number;                        // cells (from slot interpolation) and tokens (from `at`)
  }>;
  lines: Map<string, string>;                      // code block id → highlighted line spec
  packets: { x: number; y: number; label?: string; opacity: number }[];
  pulses: { target: string; k: number }[];         // k ∈ [0,1] bump curve
  callouts: { target: string; text: string; opacity: number }[];
  camera: { rect: Rect; dim: Set<string>; dimK: number };
}
```

### 1.2 Cell model (shared by validator and compiler — `core/src/cells.ts`)

* Every array/grid value slot is a **cell instance** with a stable id `<owner>@<n>` (`n` = creation
  counter per owner, initial cells `@0…@len-1`; grids `@<r>.<c>`).
* A cell **reference** (`nums#3`, `vars#lo`, `dp#1.2`, `nums#2..5`) resolves *at a point in time* to
  instance ids via the current slot order. The compiler resolves refs → instance ids; tracks never
  contain `#` refs.
* `swap` exchanges the `slot` (and therefore position) of two instances; state and value travel with
  them (PRD §3.3).
* `values` diffs old vs new value lists with LCS: matched instances get new `slot`s, removed instances
  get `visible:false`, inserted ones are new instances (`visible` false → true, state `idle`).
* Keyed arrays (`keys` set): `values` must keep length = `keys.length` (error `keys_length_mismatch`).
* Tokens on a cell point at the **instance**, so a pointer follows its value when it moves.

### 1.3 Timing rules (`core/src/timing.ts`)

* Scenario is first flattened: `branchFrom` chain → parent steps up to and including `afterStep` (marked
  `inherited`), then own steps.
* Step *k* starts at end of step *k-1* (0 for the first). Within a step, a cursor tracks the previous
  action's `[start, end]`: `start:"after"` → `prev.end + delay`; `start:"with"` → `prev.start + delay`;
  first action → `step.start + delay`. `end = start + dur` (defaults PRD §3.4).
* Step end = max(action ends, step.start) + `hold` (default 1.5).
* `send` sets the edge `state:"active"` over `[t0,t1]` then restores its previous state at `t1`.
* `callout` lasts until its step ends. `pulse` and packets end at their own `t1`.

### 1.4 Validation issue shape (PRD §5.6)

```ts
export interface Issue { severity: "error" | "warning"; code: IssueCode; path: string /* JSON Pointer */;
  where: string /* "inventory-fails › reserve-fails › action 3" */; message: string; hint?: string }
```

Error codes: `schema`, `duplicate_id`, `unknown_ref`, `bad_ref`, `wrong_target_type`, `range_not_allowed`,
`cell_out_of_bounds`, `keys_length_mismatch`, `no_edge`, `ambiguous_edge`, `branch_cycle`,
`unknown_branch_step`, `limit_exceeded`.
Warning codes: `empty_step`, `long_narration`, `too_many_reveals`, `never_visible`, `unreferenced`,
`label_wraps`, `no_focus_large`, `pin_overlap`.
`unknown_ref` hints use Levenshtein ≤ 2 against IDs of the expected type ("Did you mean 'inventory'?").
Validation always returns **all** issues, never stops at the first.

### 1.5 Edit ops

Exactly PRD §5.7, as a Zod schema in `core/src/ops.ts` (also used as MCP `inputSchema`). `remove` with
`cascade:true` deletes: edges touching a removed node, tokens starting on it, and every action that
references it (steps left with zero actions keep their narration). Without `cascade`, a referenced id
fails with `unknown_ref`-style error listing referrer paths. `applyOps(doc, ops) → { doc, forward,
inverse } | { issues }` uses Immer `produceWithPatches`, then full `validate()` of the result; any error
→ nothing changes.

### 1.6 Outline (`core/src/outline.ts`) — compact text returned by every write and `flow_get view:"outline"`

```
Saga: order checkout  (rev 4, 4 nodes, 3 edges, 2 scenarios)
groups: services "Services"
nodes: client[actor] "Client"; orch[service] "Order Saga"; payment[service@services] "Payment"; …
edges: client-orch; orch-payment; orch-inventory
arrays: nums[10] ; vars{lo,mid,hi}
scenario happy "Happy path" (11.4s)
  checkout "Checkout" (2 actions) · charge "Charge card" (2) · reserve "Reserve stock" (2)
scenario inventory-fails "What if inventory fails?" ⑂ happy@charge (14.0s)
  reserve-fails "Reservation fails" (3) · refund "Compensate" (3)
```

---

## 2. Features

Status: `[ ]` todo · `[~]` claimed · `[x]` done · `[-]` dropped.

### Phase 0 — Foundation

- [x] **F00 Repo scaffold**
  *Depends:* — · *PRD:* §11
  pnpm workspace, `tsconfig.base.json` (strict, `moduleResolution: bundler`, ESM), root
  `vitest.config.ts` using `projects: ["packages/*"]`, root scripts `typecheck` (`pnpm -r typecheck`),
  `test` (`vitest run`), `gen:schema`. `.gitignore` (node_modules, dist, data, .env). `.env.example`.
  Create `packages/core` only (empty `src/index.ts`, `src/runtime/index.ts`, package `exports` for
  `.` and `./runtime`). Add Inter + JetBrains Mono font files to `assets/fonts/` with their OFL license.
  *Done when:* `pnpm typecheck && pnpm test` pass with one trivial test.
  *Commit:* `chore: F00 monorepo scaffold`

### Phase 1 — Schema, compiler, viewer, MCP

- [x] **F01 FlowDoc Zod schema + JSON Schema**
  *Depends:* F00 · *PRD:* §3.1, §3.2, §3.5
  `core/src/schema.ts`: Zod 4 `z.strictObject` everywhere; `Id` regex; `Ref` regex covering the four
  forms; Action as `z.discriminatedUnion("do", …)` with the Timing fields merged into each member; all
  string/array length limits from §3.2/§3.5 (entity count ≤ 300 and 1 MB size are checked in F02, not in
  Zod). Export `FlowDoc`, `Action`, etc. via `z.infer`. `core/src/ref.ts`: `parseRef(ref) →
  {entity, kind: "entity"|"index"|"range"|"key"|"grid", …}`. `flowJsonSchema()` = `z.toJSONSchema`
  with everything inlined; `scripts/gen-schema.ts` writes `schema/flow-2.1.json`.
  *Done when:* both PRD §3.6 examples parse; a test walks the JSON Schema and asserts no `$ref`/`$defs`
  and `additionalProperties:false` on every object; invalid samples (bad id, unknown `do`, extra key)
  fail.
  *Commit:* `feat(core): F01 FlowDoc schema and JSON Schema export`

- [x] **F02 Structural validator**
  *Depends:* F01 · *PRD:* §3.3, §5.6
  `core/src/validate.ts`: `validate(doc: unknown) → { ok, issues, doc? }`. Converts Zod issues to the
  §1.4 shape (`code:"schema"`, JSON Pointer path, `where`). Then semantic checks that don't need time:
  duplicate IDs (document-wide, incl. default edge ids `${from}-${to}`), unknown refs with hints, wrong
  target types per action (§5.6 list: `highlight` non-code, `values` non-array, `swap` across owners,
  `send.from/to` non-node, `move.token` non-token, `label` on unsupported target), ranges outside
  `targets` (`range_not_allowed`), `send` edge resolution (`no_edge`/`ambiguous_edge`, PRD §3.3 order),
  `branchFrom` unknown scenario/step and cycles, entity-count and 1 MB limits. `where` builder:
  `scenario › step › action N` (1-based).
  *Done when:* table-driven test with one failing doc per error code; a doc with 3 distinct errors
  returns all 3; PRD examples return zero errors.
  *Commit:* `feat(core): F02 structural validation with fix hints`

- [x] **F03 Timing + cell simulation**
  *Depends:* F02 · *PRD:* §3.3, §3.4, §3.5 · *Contract:* §1.2, §1.3
  `core/src/timing.ts`: `flattenScenario(doc, id)`, `scheduleScenario(doc, id) → steps with absolute
  action [t0,t1]`. `core/src/cells.ts`: cell instances, LCS diff for `values`, ref → instance resolution
  at time *t*, swap. Hook into `validate()`: `cell_out_of_bounds` (ref checked against length at that
  moment, per scenario), `keys_length_mismatch`, scenario duration > 180 s → `limit_exceeded`.
  *Done when:* tests: `with`/`after`/`delay`/`hold` arithmetic; branch inherits parent time; push then
  `stack#4` valid only after the push; swap moves state with value; LCS keeps unchanged values' instance
  ids.
  *Commit:* `feat(core): F03 timing resolution and cell simulation`

- [x] **F04 Text measurement + theme**
  *Depends:* F00 · *PRD:* §3.1 rule 1, §4.1 (glyph table)
  `scripts/gen-glyphs.ts` (dev dep `opentype.js`) reads the bundled `.ttf`s and writes
  `core/src/runtime/glyphs.json` (advance widths for printable ASCII + Latin-1, fallback width for the
  rest; regular + bold Inter, regular JetBrains Mono). `runtime/measure.ts`: `measure(text, font,
  size)`, `wrap(text, maxWidth, maxLines=2) → { lines, overflow }`. `runtime/theme.ts`: light/dark
  palettes for each `StateName` (fill, stroke, text), group/background colors, per-`kind` shape
  (`service`→rounded rect, `state`→pill, `decision`→diamond, `db`→cylinder, `queue`→rect with dividers,
  `actor`→person glyph+label, `external`→dashed rect, `value`→circle) and min sizes, cell size, code line
  height, fonts. No per-entity colors (PRD §13).
  *Done when:* measure test against known widths (±1 px of canvas `measureText` values recorded once);
  wrap test; theme has an entry for every `StateName` × theme and every `NodeKind`.
  *Commit:* `feat(core): F04 deterministic text measurement and theme`

- [x] **F05 ELK layout**
  *Depends:* F03, F04 · *PRD:* §3.1 rule 2, §4.1 Layout
  `core/src/layout.ts`: `layout(doc) → { nodes, groups, arrays, grids, code, edges: polylines, bounds }`
  using `elkjs/lib/elk.bundled.js` (no worker). `algorithm` → ELK `layered` (+ orthogonal routing),
  `mrtree`, or `stress` (fixed `randomSeed`). `direction` → `elk.direction`. Groups → compound nodes.
  Arrays/grids/code → fixed-size leaf nodes (array size = its max length across all scenarios, from
  F03's cell simulation). Node sizes from theme + measured label (2 lines max). Hidden
  entities are laid out (reveals never reflow). Pins: run ELK, then override pinned positions and
  re-route only edges touching pinned entities with a simple 3-segment orthogonal route
  (`ponytail:` ELK-native interactive constraints if users complain). Undirected edges (`arrow:false`) are
  still fed to ELK directed for layering.
  *Done when:* layout is deterministic (same doc → deep-equal result twice); groups contain their
  children; no two nodes overlap on the saga template; pinned node lands at its `pos`.
  *Commit:* `feat(core): F05 ELK auto-layout with groups and pins`

- [x] **F06 Compiler**
  *Depends:* F03, F05 · *PRD:* §4.1 · *Contract:* §1.1
  `core/src/compile.ts`: `compile(doc) → Promise<{ compiled?, issues }>` = validate → layout → per-scenario
  schedule → tracks/packets/pulses/callouts/camera. Code blocks tokenized with shiki `codeToTokens` using
  a light/dark theme pair (load only the languages used). `focus` targets → camera rect = union of
  target rects + padding, aspect-corrected; `[]` → `null`. Branch buttons: for every scenario with
  `branchFrom`, add `{scenario, title}` to the parent's `afterStep` (and to that step in any scenario
  that inherits it). Edge state tracks for `send`. Tokens: `at` track (`{target}` for `move`/initial,
  `{edge,reverse}` during a token `send`, then `{target: to}`).
  *Done when:* golden-file test: compile both PRD examples, snapshot the `CompiledFlow` JSON
  (`toMatchFileSnapshot`). Compiled output contains no `#` refs. Compile time for a synthetic
  300-entity doc < 2 s in the test.
  *Commit:* `feat(core): F06 FlowDoc → CompiledFlow compiler`

- [x] **F07 Lint warnings**
  *Depends:* F06 · *PRD:* §5.6 Warnings
  `core/src/lint.ts`, run by `compile()` (warnings never block). All 8 warning codes in §1.4, using
  layout/timing data (`pin_overlap` from rects, `label_wraps` from `wrap().overflow`,
  `no_focus_large` = >15 visible nodes at any step and no `focus` action in the scenario, etc.).
  *Done when:* one test doc per warning code; PRD examples produce ≤ 1 warning.
  *Commit:* `feat(core): F07 explainer-quality lint`

- [x] **F08 Runtime `sample()`**
  *Depends:* F06 · *PRD:* §3.3 "Seeking is pure", §4.2 · *Contract:* §1.1
  `core/src/runtime/sample.ts` + `ease.ts`. Binary-search keys per track; interpolate `slot` →
  x/y via owner's slot rects; `at` → node center / cell position / point on edge polyline by arc length;
  `spring` = Motion's duration-based spring evaluated deterministically (import the easing function only,
  e.g. from `motion` — verify it is tree-shakeable; otherwise a closed-form critically-damped curve, ≤ 15
  lines). `reducedMotion`: `send`/`move`/`swap` become crossfades at the destination, pulses omitted.
  *Done when:* tests: sampling any `t` twice is deep-equal; sampling at step start equals state after
  replaying previous steps (seek purity) for the binary-search example; packet at t0+dur/2 is at the
  polyline midpoint. A test bundles `@flowmotion/core/runtime` with esbuild (metafile) and asserts no
  `zod`, `elkjs`, or `shiki` inputs.
  *Commit:* `feat(core): F08 pure sample() runtime`

- [x] **F09 Konva player + `<flow-player>`**
  *Depends:* F08 · *PRD:* §4.2, §4.3, §6 (Step/Play modes, navigation, accessibility)
  `packages/player`: `createPlayer(container, compiled, { mode, scenario, step, onStep }) → Player`
  (`play`, `pause`, `seek(t)`, `setSpeed`, `goToStep(id)`, `setScenario(id)`, `destroy`, `stage`).
  Build the Konva scene once from `CompiledFlow` via exported `drawEntity(kind…)` functions; per frame:
  `sample()` → `setAttrs()` → `layer.batchDraw()` (no React). Clock = one Motion `MotionValue` driven by
  `animate()` (speed 0.5–2×). Await `document.fonts.ready` (fonts loaded via `@font-face` from bundled
  woff2) before first draw. Camera = stage scale/offset + dim layer. Controls in plain DOM inside the
  custom element's shadow root: narration card (`aria-live="polite"`, `code`/**bold** parsed into
  `<code>`/`<strong>` via `textContent`), step list (also transcript), ←/→ keys, prev/next, play/pause,
  scrub bar, speed, branch buttons at branch steps, scenario switcher, arrays/grids mirrored into
  visually-hidden `<table>`s. `prefers-reduced-motion` → `reducedMotion`. `<flow-player src="…">` fetches
  a CompiledFlow (or a `.flow.json`, compiled via `import("@flowmotion/core")` lazily). Dev page
  `packages/player/dev/` (Vite) loads any file from `templates/`.
  *Done when:* `pnpm --filter player build` + size check script (gzip of the element bundle ≤ 150 KB,
  fonts excluded) passes; a Vitest browser-mode or Playwright test opens the dev page, steps through the
  binary-search example and asserts narration text per step and that `seek(t)` twice gives identical
  `stage.toDataURL()`.
  *Commit:* `feat(player): F09 Konva player and flow-player element`

- [x] **F10 Templates + authoring guide**
  *Depends:* F07 (F09 recommended, to eyeball them) · *PRD:* §5.4, §12 Phase 1
  `templates/`: `circuit-breaker`, `saga-compensation`, `temporal-replay`, `retry-backoff-dlq`,
  `oauth-pkce`, `binary-search`, `backprop` (`.flow.json`, each with ≥ 1 failure/edge-case branch
  where it makes sense, narration a learner can follow). `docs/guide.md`: schema essentials, the six
  design rules, action cheat-sheet with one-line examples, the recommended workflow (§5.4), size advice
  (incremental above ~40 entities), common errors and how to fix them, template list with IDs. Keep it
  under ~6K tokens.
  *Done when:* test compiles every template with 0 errors and ≤ 1 warning; guide mentions every action
  `do` value (test greps).
  *Commit:* `feat: F10 seven templates and authoring guide`

- [x] **F11 Ops engine + outline**
  *Depends:* F02 · *PRD:* §5.7 · *Contract:* §1.5, §1.6
  `core/src/ops.ts` (Zod `Op` schema + `applyOps`), `core/src/outline.ts` (`outline(doc, rev?)`).
  *Done when:* tests: upsert insert/replace, `upsertStep` with/without `after`, `remove` without cascade
  fails listing referrers, with cascade removes edges/actions, batch with one bad op changes nothing,
  applying `inverse` restores the original doc; outline snapshot of the saga example.
  *Commit:* `feat(core): F11 ID-addressed edit ops and outline`

- [x] **F12 DB schema + server skeleton**
  *Depends:* F00 · *PRD:* §9 Storage
  *(Superseded by F13: DB, migrations and auth removed.)* `packages/server`: Express 5 app factory `createApp({ db, env })`, `src/db.ts` (`Db` type, migration
  runner over `migrations/*.sql`), `src/main.ts` (pg Pool). Tables (no `users` yet — F32):
  `workspaces`, `api_keys` (workspace_id, sha256 hash, prefix, scopes text[] ⊂ {read,write,export}),
  `flows` (id, workspace_id, title, doc jsonb, revision int, public bool, created_at, updated_at),
  `flow_revisions` (flow_id, revision, doc jsonb, forward jsonb, inverse jsonb, author_type
  `user|agent|mcp`, client text, prompt text, created_at; PK (flow_id, revision)), `compiled_cache`
  (flow_id, revision, compiled jsonb), `jobs` (id, kind, status, input jsonb, progress, result jsonb,
  error, workspace_id, timestamps), `oauth_*` tables as needed by F16. `GET /healthz`.
  *Done when:* test runs migrations on PGlite and round-trips a flow row.
  *Commit:* `feat(server): F12 Postgres schema and app skeleton`

- [x] **F13 Stateless tool layer + share API**
  *Depends:* F07, F11 · *PRD:* §5.3, §6. **Supersedes F12's DB/auth** (F12 code is deleted here; see §0.3 Storage).
  `server/src/tools.ts` — one implementation per tool for REST, MCP and the co-pilot: `guide()`,
  `validate({doc})`, `publish({doc})` → `{id, url, outline, warnings}` (validate + compile, write
  `{doc, compiled}` to the `BlobStore`, immutable), `get({id, view, ids})` (outline | full | picked
  entities/steps), `edit({id, ops})` (load snapshot, `applyOps`, publish as a **new id**; `from` = old id),
  `applyOps({doc, ops})` (pure, for local callers). Errors → `ToolError` (422 body = all issues, 404, 413,
  429). REST (public, no auth): `POST /api/validate`, `POST /api/share`, `GET /api/share/:id` (`{doc,
  compiled}`), `POST /api/share/:id/ops`, `POST /api/ops` (`{doc, ops}` stateless), `GET
  /schema/flow-2.1.json`, `GET /llms.txt`. `BlobStore` in `store.ts` (memory, local dir, R2/S3). IP rate
  limit (tight on writes). Templates are static repo files (web bundles them); no seeding.
  *Done when:* tests (`fetch` against `app.listen(0)`, in-memory store): publish → get; invalid doc returns
  all issues (422); edit by id yields a new id and leaves the old one intact; 429 after the limit.
  *Commit:* `refactor(server): F13 stateless tool layer and share API (drop DB/auth)`

- [x] **F14 Web app shell + viewer page**
  *Depends:* F09, F13 · *PRD:* §6 (share link; full sharing is F24)
  `packages/web` (Vite + React 19 + Tailwind). Routes: `/` (local library from IndexedDB: list, new, import `.flow.json`, bundled templates), `/v/:id` (public shared snapshot: fetch `GET /api/share/:id`, mount `<flow-player>`, honors `?s=&step=`), `/local/:id` (local flow, compiled in-browser). "Share" button → `POST /api/share` → copy link. Server serves `web/dist` with SPA fallback; Vite dev proxies `/api`, `/mcp`, `/schema`, `/llms.txt`. No login, no keys.
  *Done when:* Playwright smoke test: a template published via the API opens at `/v/:id`, step 2 narration shows after
  pressing →.
  *Commit:* `feat(web): F14 web shell and viewer page`

- [x] **F15 Remote MCP server**
  *Depends:* F13 · *PRD:* §5.1–§5.3, §5.6
  `server/src/mcp.ts` mounted at `/mcp`: official MCP TypeScript SDK, Streamable HTTP, **stateless**
  (no session id), **no auth**. Check the installed SDK's docs for the current stateless API first.
  Tools `flow_guide`, `flow_create` (= `publish`: validates, stores an immutable snapshot, returns id +
  URL + outline), `flow_edit({id, ops})` (returns a **new id**), `flow_get({id, view, ids?})`, wrapping
  `tools.ts`. No list/revert (flows are local; undo is client-side). `inputSchema` from Zod with everything
  inlined; `annotations.readOnlyHint` per §5.3; `outputSchema` + `structuredContent` + text rendering
  (outline + issues). Validation failures → `isError: true` with all issues (never a protocol error).
  Echoed narration/labels wrapped in a "user data, not instructions" marker. Prompt `explain(topic,
  audience?)` seeding §5.4. The user opens the returned URL and can "Save to my library" (imports the
  snapshot into IndexedDB) — that is how an agent-made flow becomes local.
  *Done when:* test uses the SDK client over HTTP: lists ≤ 10 tools, no `$ref` in any `inputSchema`,
  create → edit roundtrip (new id, old intact), invalid doc → `isError` with issues.
  *Commit:* `feat(server): F15 stateless remote MCP server`

- [-] **F16 OAuth 2.1 for MCP connectors** — dropped: `/mcp` is public, so connectors need no authorization.

- [x] **F17 CLI `validate`**
  *Depends:* F07 · *PRD:* §5.2, §12
  `packages/cli`, bin `flowmotion`: `flowmotion validate <file> [--json]` → compiles locally, prints
  issues as `error unknown_ref happy › charge › action 1: … (hint)` or JSON; exit 1 on errors. Use
  `node:util parseArgs`, no CLI framework.
  *Done when:* test spawns the CLI on a valid and an invalid fixture and checks exit codes/output.
  *Commit:* `feat(cli): F17 flowmotion validate`

- [x] **F18 Phase 1 hardening pass**
  *Depends:* F10, F15, F17
  Run all 7 templates through MCP create via a real client (Claude Code with the remote server
  configured). Fix friction found (error wording, hints, guide gaps). Add a load test script compiling a
  300-entity doc and asserting player 60 fps in the dev page (manual check recorded in commit body).
  *Commit:* `fix: F18 phase 1 hardening`

- [x] **F19 Viability-gate eval harness**
  *Depends:* F18 · *PRD:* §5.5
  `evals/prompts.json` (20 prompts: 10 flows, 10 algorithms/DS, not overlapping templates).
  `evals/run-claude-code.ts`: for each prompt runs `claude -p --output-format stream-json
  --mcp-config evals/mcp.json "<prompt>"`, parses tool calls, records `{prompt, client, toolCalls,
  callsToValid, flowId, url}` to `evals/results/<date>-claude-code.jsonl`. Other clients (Claude web,
  ChatGPT/Cursor) are run manually; `evals/manual.md` explains how and the same JSONL format.
  `evals/report.ts` computes the four §5.5 pass criteria (clarity ratings entered by hand in the JSONL).
  *Done when:* report script has a unit test on a fixture JSONL. **Phase 1 exit = report shows pass.**
  If it fails, stop and open a plan edit simplifying schema/tool shapes before Phase 2.
  *Commit:* `feat(evals): F19 viability gate harness`

### Phase 2 — Preview, inline player, generation, sharing, export

- [x] **F20 Render page**
  *Depends:* F14 · *PRD:* §8, §4.2 Determinism
  `/render/:flowId/:rev?s=&mode=still|sheet|video&step=&captions=1&w=&h=` in `web`: fixed-size stage,
  no controls, `window.__PLAYER__ = { ready: Promise, duration, steps, seek(t) → Promise<void> /* resolves
  after draw */, frame() → Uint8ClampedArray /* RGBA */ }`. `captions=1` adds a Konva caption layer
  (narration of the current step, wrapped) and a step title bar. `mode=sheet` draws every step's
  end-of-step frame in a grid with titles, long edge ≤ 1600 px.
  *Done when:* Playwright test: two loads of the same render URL produce identical pixels at the same
  `t`.
  *Commit:* `feat(web): F20 deterministic render page`

- [x] **F21 Render worker (stills + video)**
  *Depends:* F20 · *PRD:* §8
  `packages/worker`: one long-lived Chromium (Playwright) with fixed DPR=1. `renderStill(id | doc,
  scenario, step?)` → PNG (step end frame, or contact sheet when step omitted). In-process job loop (§0.3 Jobs): `kind:"export"` → seek each frame `i/fps`, read `frame()` RGBA, pipe raw frames to
  `ffmpeg -f rawvideo -pix_fmt rgba -s WxH -r fps -i -` → `libx264 yuv420p` mp4 / `libvpx-vp9` webm /
  two-pass `palettegen`+`paletteuse` gif; 720p/1080p, 30/60 fps, captions default on; progress written
  to the in-memory job; output to the `BlobStore`. Branch export includes inherited steps
  (already in compiled scenario).
  *Done when:* test exports a 2-step template to mp4 at 720p/30 and `ffprobe` reports the expected
  duration ±1 frame.
  *Commit:* `feat(worker): F21 Playwright + FFmpeg render worker`

- [x] **F22 `flow_preview`, `flow_export`, `flow_job` + CLI preview/render** (IP rate-limited; exports capped in length/size)
  *Depends:* F21, F15 · *PRD:* §5.3, §5.1 (Tasks), §8
  Tools + REST (`POST /api/share/:id/preview`, `POST /api/share/:id/export`, `GET /api/jobs/:id`,
  `GET /api/jobs/:id/events` SSE, optional `webhookUrl` on export, POSTed on completion). `flow_preview`
  returns image content (PNG) + text (outline, lint) + viewer URL, computed synchronously by calling the
  worker's still renderer (worker exposes a tiny internal HTTP endpoint, or server imports it in-process —
  pick in-process unless deployment says otherwise). `flow_export` creates a job; if the client declared
  MCP Tasks support, return a task, else the job id for `flow_job`. CLI: `flowmotion preview <id|file>
  [-o out.png]`, `flowmotion render <id> --scenario s --format mp4 [-o out.mp4]` (uploads files via
  `create dryRun`/temp flow when given a file).
  *Done when:* MCP client test gets an image content block from `flow_preview`; export job reaches
  `done` with a URL.
  *Commit:* `feat(server): F22 preview and export tools`

- [x] **F23 MCP App inline player**
  *Depends:* F22, F09 · *PRD:* §5.3 MCP App
  Register `ui://flowmotion/player` HTML resource (single self-contained page: player bundle inlined,
  receives the compiled flow from the tool result via the MCP Apps host bridge). `flow_create`,
  `flow_edit`, `flow_preview` results reference it per the current MCP Apps extension spec (read the spec
  and `@modelcontextprotocol/ext-apps` docs first). "Open in editor" link. Clients without Apps still get
  the URL in text.
  *Done when:* resource listed and fetchable via SDK client; manual check in one Apps-capable client
  noted in commit body.
  *Commit:* `feat(server): F23 MCP App inline player`

- [ ] **F24 Embed, deep links, remix**
  *Depends:* F14, F20 · *PRD:* §6
  `/embed/:id` (chrome-less, step mode default), copy-embed dialog (iframe + `<flow-player>` snippets),
  `<flow-player>` published as a standalone script at `/flow-player.js`, deep links `?s=&step=` kept in
  sync with navigation (`history.replaceState`), share card meta (`og:title`, `og:description` from
  summary, `og:image` = cached still of the first scenario's last step, stored next to the snapshot). "Remix" button in the viewer
  imports the snapshot into the local library (client-only). Publish already exists (F13/F14).
  *Done when:* Playwright: deep link opens on the right step; remix adds a local flow.
  *Commit:* `feat(web): F24 embed, deep links, remix`

- [ ] **F25 In-app generation pipeline**
  *Depends:* F22 · *PRD:* §5.8
  Load the `claude-api` skill / current Anthropic docs first. `server/src/generate.ts`:
  `generate({prompt}) → stream of events` — guide + 1–2 closest templates (simple keyword
  overlap on title/summary; `ponytail:` embeddings if retrieval quality matters) as examples; model
  `claude-opus-5-5`, streamed, structured outputs with the FlowDoc JSON Schema (strip any keywords the
  API rejects, keep server validation as truth); no forced tool choice. Repair loop ≤ 3 rounds feeding
  issues verbatim; visual self-check (contact sheet image + lint) → at most one edit-op batch.
  `editWithAI({doc, instruction, selectedIds})` → outline + selected entities' JSON →
  edit ops returned to the client (applied as one local undo entry labeled with the request). REST:
  `POST /api/generate` (SSE progress), `POST /api/ai-edit`. Dashboard gets a prompt box →
  progress → opens in the local library. IP rate-limited (the server pays for the model).
  *Done when:* tests with a stubbed model client: repair loop stops after a valid doc or 3 rounds; AI
  edit returns one op batch. One live run noted in commit body.
  *Commit:* `feat(server): F25 in-app generation with repair loop`

- [ ] **F26 Phase 2 hardening**
  *Depends:* F23, F24, F25
  Re-run F19 evals now using `flow_preview` in the workflow; measure prompt → first playable preview
  (target ≤ 30 s median, §10). Fix regressions.
  *Commit:* `fix: F26 phase 2 hardening`

### Phase 2b — Presentation, text DSL, icons

Principle kept: agents never specify look (no colors, shapes, coordinates, absolute time). We grow the
**vocabulary** (icons, tones, effects) and the **presentation** instead. FlowDoc JSON stays canonical;
new fields are optional and additive (schema stays `2.1`, run `gen:schema`).

**Track A — Presentation (three-zone viewer)**

- [x] **F33 Step change-sets**
  *Depends:* F09
  Extend §1.1 `CompiledScenario.steps[]` with `changes: {target, prop, from, to}[]` (state, label, at,
  visible; derived from `tracks` keys falling inside the step) and `stateAt(step)` helpers in
  `core/src/runtime` returning the settled value of every array/grid cell, token position and node
  state at step end (reuse `sample.ts`). No schema change.
  *Done when:* test: binary-search step 2 reports `lo: 0→5` and `nums#0..4 state → disabled`; settled
  state at step N equals sampling the tracks at that step's end time.
  *Commit:* `feat(core): F33 per-step change sets`

- [x] **F34 Three-zone player UI**
  *Depends:* F33, F14
  Rework `player/src/element.ts` layout. **Left rail:** scenario tabs; main line as a step timeline
  (done / current / upcoming), branches drawn as a fork off the step they leave; clicking jumps.
  **Center:** stage with floating prev / play / next only (speed and mode in an overflow menu).
  **Right "Now" panel:** step title (large), narration (readable size), "What changed" list from F33,
  then a live state table of arrays/grids/tokens with changed cells highlighted. Below ~720 px: stage,
  Now panel, then a collapsible rail. Keep the hidden accessible tables, arrow/space keys, `?s=&step=`.
  *Done when:* Playwright: step through binary-search; Now panel shows the F33 changes and highlights
  `lo`; branch tab switches scenario; mobile viewport has no horizontal scroll.
  *Commit:* `feat(player): F34 three-zone layout with Now panel`

**Track B — Text DSL (compiles to FlowDoc)**

- [x] **F35 DSL go/no-go spike**
  *Depends:* F17
  Hand-translate `saga-compensation` and the optimistic-lock flow into the draft DSL (one action per
  line, see `docs/dsl-draft.md`, written here). Record token counts vs JSON (use the token counter).
  *Done when:* `docs/dsl-draft.md` has the grammar sketch and the numbers. **Gate:** under 40 % token
  saving → stop and drop F36-F38.
  *Commit:* `docs: F35 DSL spike results`

- [x] **F36 DSL parser and printer**
  *Depends:* F35
  `core/src/dsl.ts`: `parseDsl(text) → {doc?, issues}` and `printDsl(doc) → string`. Hand-written
  line parser (no dependency). Errors carry `line`/`col` and "did you mean" for action names and ids;
  schema issues from `validate` are mapped back to source lines through a path→line table.
  Indentation: 2 spaces; quote any value with spaces; cell values are always strings (no YAML-style
  coercion).
  *Done when:* all 7 templates round-trip `doc → printDsl → parseDsl → doc` deep-equal; a fixture with 5
  typical mistakes yields line-numbered errors.
  *Commit:* `feat(core): F36 flow text DSL parser and printer`

- [x] **F37 DSL in MCP, API, CLI, web**
  *Depends:* F36, F15, F17
  `flow_create`/`flow_edit` accept `dsl` (string) beside `doc`/`ops`; `flow_get view:"dsl"`; the API
  mirrors it; CLI `validate` reads `.flow` text files; web import/export of `.flow`. Rewrite
  `docs/guide.md` around DSL with the JSON form as appendix; keep the guide under 6000 tokens.
  *Done when:* MCP test creates a flow from DSL and reads it back as DSL; invalid DSL returns
  line-numbered issues with `isError`.
  *Commit:* `feat(server): F37 DSL authoring over MCP/API/CLI`

- [x] **F38 Authoring eval: JSON vs DSL**
  *Depends:* F37, F19
  Reuse the F19 prompts. Fresh agent runs per format. Metrics: first-try validity, rounds to valid,
  tokens, lint warnings. Results in `evals/results/`.
  *Done when:* report committed with a recommendation (default format in the guide).
  *Commit:* `feat(evals): F38 JSON vs DSL authoring comparison`

**Track C — Vocabulary and icons**

- [ ] **F39 Icon field, packs, resolver**
  *Depends:* F09, F13
  Optional `icon: "<pack>:<name>"` on nodes (regex-validated). Open-source packs only, from Iconify
  JSON: `lucide` (ISC), `simple-icons` (CC0), plus open infra/dev packs after a license check recorded
  in `assets/icons/LICENSES.md` (nothing proprietary, no AWS set). `gen:icons` script builds compact
  pack data under `core/src/icons/` (server and web compile only, lazily imported; never in the
  player bundle). Compiler resolves used refs into `compiled.icons: Record<ref, {viewBox, body, mono}>`.
  Mono icons draw with the node's text color (theme and state aware); colored logos keep colors.
  Player draws the icon in the node; no icon = the kind glyph. Unknown ref → error `unknown_icon`
  with nearest names as `hint`.
  *Done when:* test: `icon: "si:postgresql"` compiles with exactly one `icons` entry; unknown name
  errors with a suggestion; snapshot renders identically with the pack data absent (self-contained).
  *Commit:* `feat(core): F39 icon packs and resolver`

- [ ] **F40 Icon search for agents**
  *Depends:* F39
  `flow_icons {query, pack?, limit?}` MCP tool + `GET /api/icons?q=` returning `pack:name` and a tag
  list; guide lists packs and the naming rule only. Tool count stays ≤ 10.
  *Done when:* test: query "postgres" returns `si:postgresql`; MCP tool list schema still has no `$ref`.
  *Commit:* `feat(server): F40 icon search tool`

- [ ] **F41 Local icon import**
  *Depends:* F39, F14
  `local:<name>` pack in IndexedDB (browser only). Import by file drop or pasted SVG; sanitize (strip
  script, foreignObject, event handlers, external hrefs/urls, `<style>` with imports), normalize to a
  viewBox, cap 20 KB, store body only, render as inline paths (never `<img>`). Server/MCP: `local:`
  passes schema but gives warning `icon_unresolved` and falls back to the kind glyph. Share dialog:
  lists local icons used; default = share with fallback glyph; opt-in "embed these in the public
  snapshot". The stored doc keeps `local:` refs either way.
  *Done when:* tests: hostile SVG is sanitized to safe output; server compile of a `local:` ref warns
  and succeeds; Playwright: share without embed shows fallback, with embed shows the icon.
  *Commit:* `feat(web): F41 local icon import and share rules`

- [ ] **F42 Tones**
  *Depends:* F09
  Optional `tone: primary | muted | danger` on nodes and groups: semantic emphasis mapped by the theme
  (light and dark), orthogonal to `state`. Lint: more than a third of nodes `primary` → warning.
  *Done when:* schema + compile test; player draws three distinct tones; guide updated.
  *Commit:* `feat(core): F42 semantic tones`

- [ ] **F43 Named effects**
  *Depends:* F09
  New action `effect` with `{target(s), name: shake | grow | fade | flash}` (no numeric transforms, no
  rotation); timing keys like other actions; ends with its step if transient.
  *Done when:* each effect compiles to deterministic tracks (same output twice); player test; guide
  lists the four.
  *Commit:* `feat(core): F43 named effects`

Dependency notes: A, B, C are independent lanes. F34 gates the visual quality pass; F35 gates all of B.
Icons and DSL syntax meet in F36/F37 (`icon=pack:name`, `tone=`, `effect` lines) — add them to the
grammar when F39/F42/F43 land.

### Phase 3 — Visual editor

- [x] **F27 Editor shell, store, local persistence**
  *Depends:* F24 · *PRD:* §7, §5.7 (undo)
  `/edit/:id` (local flow) in `web`. zustand + immer store holding the doc, selection, and an undo/redo
  stack of op batches (forward/inverse from `applyOps`, run in the browser — core is browser-safe).
  Autosave to IndexedDB; revision snapshots on explicit "Save version". react-konva stage with pan/zoom,
  entities drawn via the player's `drawEntity`, selection. Live preview = compile in a Web Worker on change.
  *Done when:* Playwright: open editor, select node, undo/redo a label change across reload.
  *Built (deviations):* no zustand/react-konva/Worker. Framework-free store (`editor/store.ts`) + Konva
  overlay on the player (`editor/overlay.ts`, `Player.world` exposes the camera); compile runs on the main
  thread. `CompiledFlow.shift` added (compiled = layout space + shift; `pos = compiled - shift`).
  Undo history and versions persist in the IndexedDB record. Version restore is a dropdown (full list = F31).
  *Commit:* `feat(web): F27 editor shell with undo and local persistence`

- [x] **F28 Canvas editing: drag-to-pin, re-layout, palette, connect**
  *Depends:* F27 · *PRD:* §7 Canvas
  Drag node/array/grid → `upsert` with `pos` (live edge re-route uses the F05 pin router); "Re-layout"
  clears all pins in one batch; palette adds node kinds/array/grid/token/code with generated kebab ids;
  drag from node handle to node creates an edge; delete key → `remove` (with cascade confirm).
  *Deferred:* edges re-route after drop (recompile), not live while dragging.
  *Commit:* `feat(web): F28 canvas editing`

- [x] **F29 Inspector**
  *Depends:* F27 · *PRD:* §7 Inspector
  Label, kind, group, initial state, hidden; inline cell editing for arrays/grids; theme swatch of every
  `StateName`. Each change = one op batch (debounced for text).
  *Deferred:* theme swatches; array keys, grid row/col labels, token `at` not editable. Text commits on blur (one undo entry each).
  *Commit:* `feat(web): F29 inspector with cell editing`

- [x] **F30 Step + timeline editor**
  *Depends:* F27 · *PRD:* §7 Step editor
  Scenario tabs, step list (add/reorder/remove via `upsertStep`/`removeStep`), narration field with
  length counter, per-step timeline: actions as bars from scheduled times (F03); drag bar edges → `dur`,
  drag body → `delay`; toggle sequence/parallel → `start`; click → seek the preview player.
  *Deferred:* timeline bars (drag → `dur`/`delay`, `start` toggle). Steps are text fields; actions: edit
  `label`/`callout` text and `state`, delete, add state/show/hide/pulse/focus/label/callout on the selection.
  `send`/`move`/`swap`/`values`/`highlight` can't be added in the UI yet.
  *Commit:* `feat(web): F30 step and timeline editor`

- [ ] **F31 AI panel + revision history**
  *Depends:* F25, F27 · *PRD:* §7 AI panel, §5.8 step 4
  Prompt box (generate / edit selection via `ai-edit`), local version list (time, label, AI prompt)
  with one-click restore, changed entities highlighted after an AI batch, AI batch = one undo entry
  labeled with the request.
  *Commit:* `feat(web): F31 AI panel and revision history`

---

- [-] **F32 GitHub login + sessions** — dropped: no accounts; flows are local, sharing is anonymous.

---

## 3. Dependency graph (quick view)

```
F00 ─ F01 ─ F02 ─ F03 ─┐
  │                    F05 ─ F06 ─ F07 ─ F10 ─┐
  ├─ F04 ──────────────┘     │      ├─ F17 │
  │                          └ F08 ─ F09 ──┤
  └─ F12 (superseded by F13) F02 ─ F11 ─┐         │
                  └──────────────┴─ F13 ─ F14
                                    └─ F15
F18 (F10,F15,F17) ─ F19 ══ Phase 1 gate
F14 ─ F20 ─ F21 ─ F22 ─ F23 ; F22 ─ F25 ; F14,F20 ─ F24 ; F26 (F23,F24,F25)
F24 ─ F27 ─ F28 / F29 / F30 ; F25,F27 ─ F31
```

Good parallel lanes after F00: **core** (F01→F03 ∥ F04, then F05), **server** (F12), then
**player** (F09) alongside **API/MCP** (F13→F15).

## 4. Out of scope (PRD §13) — do not build

(Sequence layout shipped as `layout.algorithm: "sequence"`.) free-form drawing/custom shapes/per-entity colors, TTS, real-time co-editing,
local stdio MCP server, MCP sampling.
