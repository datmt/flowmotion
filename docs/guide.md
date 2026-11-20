# FlowMotion authoring guide

You write a **flow** in a small line-based text format (the DSL): entities plus scenarios made of steps. Layout, colors, timing and camera are automatic. Never give coordinates or absolute times. Pass it as `dsl` to `flow_create` / `flow_edit`. (A JSON FlowDoc, `doc`, is also accepted; see the appendix.)

## DSL at a glance

```
flow "Saga: order checkout"
summary "How a saga commits and compensates."
# optional header lines: theme dark | aspect 16:9 | layout algorithm=layered direction=LR edges=straight
theme dark

group services "Services"
node client "Client" actor
# group options: tone=   node options: in= state= tone= pos= icon= hidden   (tone: primary = the one or two nodes to look at, muted = background detail, danger = the risky part; only changes the idle look, a state overrides it)   (icon=<pack>:<name>, packs: lucide, si, carbon, devicon; find names with flow_icons; e.g. icon=si:postgresql, icon=lucide:server; never invent `local:` refs, those are a user's private browser icons and render as the default glyph with a warning)
node payment "Payment" service in=services state=idle
# edge options: id= hidden dashed noarrow
edge client > payment "Charge" dashed
array nums "Numbers" keys=lo,mid,hi orientation=column = 2 5 "a b"
grid dp "DP table"
  rowlabels r0 r1
  collabels c0 c1
  row 0 1
  row 1 2
token lo "lo" at=nums#0
code src ts "Title"
  | let x = 1;
  | x++

scenario happy "Happy path"
  step checkout "Checkout" hold=1
    "Narration, required: plain text, `code`, **bold**."
    send client > payment "Charge" with
    state payment success dur=0.5 ease=spring
scenario fail "What if it fails?" from=happy/checkout
  step boom "Boom"
    "..."
```

Rules: 2-space indent; a line starting with `#` is a comment (no trailing comments); strings are double-quoted (`\"`, `\n`); a bare word is a string, so cell values are always strings (`1` is "1"). Lists are comma-joined without spaces (`a,b#2..4`). Options are `key=value` or bare flags. Values of `array` and `values` go after a bare `=`. Each step has one quoted narration line, an optional `detail "longer text"` line (shown as "Learn more", <= 1200 chars), then one action per line. Errors come back with line and column and a hint.

## Entities and ids

* `node` kinds: service, state, decision, db, queue, actor, external, value (tree/graph vertex, neuron). Edge id defaults to `from-to`; set `id=` if duplicates exist.
* `keys=` on an array makes named cells (a variables panel). Layout: `layered` (default), `tree` (BSTs, use `direction=TB`), `stress` (general graphs). `edges=straight` draws diagonal lines instead of orthogonal routes, best for fully connected graphs like neural nets.
* States: idle, active, success, error, warning, pending, disabled.
* IDs: kebab-case `^[a-z][a-z0-9-]{0,39}$`, unique across the whole document. Reference by id, never by position.
* Refs: entity id, or cell `nums#3`, range `nums#2..5` (in target lists only), keyed `vars#lo`, grid `dp#1.2`, grid rectangle `dp#0.0..2.2` (row.col..row.col, top-left first, in target lists only).
* Limits: 300 entities, 64 cells per array, 16x16 per grid, 180 s per scenario, 1-8 scenarios, 1-40 steps each, 0-12 actions per step, narration <= 400 chars.

## Design rules

1. Semantic, not geometric: pick a `kind` and a `state`, never a shape or color. No coordinates (`pos=` is for human pins only).
2. No absolute time: actions run in sequence, steps in order. `with` runs an action beside the previous one; `delay=`, `dur=`, `ease=linear|inOut|spring` tune it.
3. One way to do each thing: one action per effect.

## Actions

| Action | DSL line |
|---|---|
| state | `state payment,nums#0..2 error` |
| show / hide | `show attacker` (reveals hidden entities; edges by id) |
| label | `label vars#lo "5" with` (node, edge or cell text) |
| pulse | `pulse nums#4` (attention bump, for comparisons) |
| effect | `effect api shake` — one of `shake` (error/jitter), `grow` (emphasis), `fade` (dim and return), `flash` (quick blinks) |
| focus | `focus orch,payment dim`; bare `focus` = full view |
| callout | `callout orch "Owns the transaction"` (<= 120 chars, ends with its step) |
| send | `send orch > payment "Charge"` (needs an edge either way; `via=id` if several; `token=id` moves a token) |
| move | `move lo to nums#5` (pointer jump, no edge needed) |
| swap | `swap nums#0 nums#1` (same array or grid) |
| values | `values stack dur=1 = a b` (push, pop, enqueue; unchanged values stay put) |
| highlight | `highlight src "3-5,9"`; `""` clears |

State persists across steps; `callout`, `pulse`, `effect` and packets end with their step. Cell refs are checked against the array length at that moment.

## Workflow

1. Call `flow_guide` once. Optionally `flow_get` (`view:"dsl"`) the closest catalog template as a style reference, e.g. `id:"distributed-systems/circuit-breaker"`.
2. Plan: entities, a happy-path scenario, and the failure or edge case worth showing as a branch.
3. Up to ~40 entities: `flow_create` with the full `dsl`. Larger: `flow_create` with entities and the first scenario, then one `flow_edit` per remaining scenario (incremental).
4. Fix **every** reported error in one follow-up call. Syntax issues carry `line`/`col`; all issues have a `where` and a `hint`. `flow_edit` takes `ops` for small changes or a whole new `dsl`.
5. `flow_preview` returns one contact sheet per scenario: **look at every one** (branches too), then fix layout, clarity and every lint warning with `flow_edit`. Don't ship with `edge_label_overlap`, `edge_label_over_node` or `diagram_too_small` unfixed.
6. Give the user the viewer URL.

Layout tips: keep to ~8 nodes per scenario view and at most one edge between a pair of nodes. Edge labels are static captions, so label only edges that need a name; show messages with `send ... "label"` (a moving packet) instead of labelling every edge. Meshes (cluster peers) read best with `edges=straight`; use `noarrow` for symmetric links.

Tips: 3-8 steps per scenario; one idea per step; narration explains *why*, not what moved. Use `with` to run label updates beside the motion. Add a branch (`branchFrom`) for "what if it fails?".

## Tools

Server: Streamable HTTP, stateless, no auth: `POST <base>/mcp` (the same guide is at `GET <base>/llms.txt`). Tool failures return `isError` with every issue in one list.

| Tool | Use |
|---|---|
| `flow_guide` | This guide. Call once. `topic:"article"` returns the lesson-article guide instead. |
| `flow_create` | `dsl` (or `doc`) -> immutable snapshot: `id`, `url`, `outline`, `warnings`. |
| `flow_edit` | `id` + `ops` (small change) or `id` + `dsl` (rewrite). Publishes a NEW id; the old one stays. Always continue from the newest id. |
| `flow_get` | `id` (a flow id, or a catalog template as `<domain>/<slug>`), `view` = `outline` (default) / `dsl` / `full` / `article` (a catalog flow's lesson Markdown, or null); `ids` = only those entities or steps. Use `dsl` to read a template or an earlier flow. |
| `flow_preview` | PNGs: contact sheet per scenario, or `scenario` + `step` (0-based) for one frame. Accepts `id`, or `dsl`/`doc` to snapshot and preview in one call. |
| `flow_export` / `flow_job` | Video (`mp4`/`webm`/`gif`, `height` 720/1080, `fps` 30/60, `captions`). Poll `flow_job` until `done`, then give the user `url`. Only on request; max 180 s. |

## Editing with `ops`

`ops` is a list (1-100) of ID-addressed edits, applied atomically; any error rejects all of them.

```
{"op":"upsert","entity":"node","value":{"id":"cache","label":"Cache","kind":"db"}}   // add or replace by id
{"op":"remove","id":"cache","cascade":true}              // cascade also drops its edges, tokens, actions' refs
{"op":"upsertStep","scenario":"happy","after":"checkout","value":{"id":"s2","title":"..","narration":"..","actions":[]}}
{"op":"removeStep","scenario":"happy","step":"s2"}
{"op":"upsertScenario","value":{"id":"fail","title":"..","branchFrom":{"scenario":"happy","afterStep":"checkout"},"steps":[..]}}
{"op":"removeScenario","id":"fail"}
{"op":"setMeta","value":{"title":"..","theme":"dark","layout":{"direction":"LR"}}}
```

`entity` is one of node, edge, group, array, grid, token, code. For many or structural changes, a whole new `dsl` is simpler.

## Lint warnings (`warnings`, from create/edit/preview)

`edge_label_overlap`, `edge_label_over_node`, `diagram_too_small` must be fixed: fewer nodes per view, shorter or no edge labels, `direction=LR/TB`, `edges=straight`, or split into scenarios. `never_visible`: hidden but never `show`n; add `show` or drop `hidden`. `unreferenced`: declared but unused; connect, use or remove it.

## Common errors

* `unknown_ref`: id not defined; check spelling and that it's an entity id.
* `no_edge` on `send`: add the edge, or use `move` for pointers.
* `ambiguous_edge`: several edges match; set `via`.
* `cell_out_of_bounds`: index past the array length at that step; `values` first.
* `duplicate_id`: ids are unique across nodes, edges, groups, arrays, steps, scenarios.
* `schema`: extra key, id not kebab-case, or text over its limit.
* Hidden entity used before `show`: add a `show` action first.

## Catalog (`templates/<domain>/<slug>.flow`)

The app's left pane is a tree of this folder: one folder per domain, one DSL file per flow. Read any of them with `flow_get` as `<domain>/<slug>`. Existing (generated from the folder; `flow_get` with `view:"outline"` shows each summary):

<!-- catalog -->

### Adding a flow to the catalog

1. Build and review it with the normal workflow; it must compile with 0 errors and at most 1 warning.
2. Save the final DSL as `templates/<domain>/<slug>.flow` (`flow_get` with `view:"dsl"` returns it). Reuse an existing domain folder when one fits; a new domain is a new lowercase kebab-case folder. `<slug>` is lowercase kebab-case and unique across the catalog.
3. `meta.title` is the display name; give it a one-sentence `summary`, 2-5 `tags` (kebab-case), a `level` (beginner/intermediate/advanced) and `source` URLs (required for regulated domains: banking, insurance, fintech, law). `related <domain>/<slug> ...` links neighbours. Keep the style of its neighbours (theme, layout, 3-8 steps per scenario).
4. Run `flowmotion validate templates/<domain>/<slug>.flow`, then `pnpm test`: it compiles every file, round-trips the DSL, and checks the metadata.
5. Write its article, `templates/<domain>/<slug>.md`, following `docs/article-guide.md` (required: the test fails without it). Add `detail` to steps that need more than the narration.
6. Commit. The list above is generated from the folder. Redeploy. The app reads the folder at build time, so a redeploy is what publishes it.

### Picking what to build

`docs/backlog.md` lists every flow, built (`[x]`) and planned (`[ ]`): `slug: topic (level) - failure branch to show`. To build the next one: take the first `[ ]` line in the domain you were given (or the `**pilot**` lines first for new domains), use `<domain>/<slug>` as the file path, set `level` from the line and the failure branch as a branch scenario. Write the article too (`docs/article-guide.md`). When `pnpm test` passes, change its line to `- [x] <slug>` (drop the description) in the same commit. Report DSL gaps you hit instead of working around them silently.

## Appendix: JSON FlowDoc

`doc` is the same model as JSON, version `"2.1"`:

```
{ "version":"2.1", "meta":{title,summary?,theme?,aspect?}, "layout"?:{algorithm?,direction?,edges?},
  "groups"?, "nodes", "edges", "arrays"?, "grids"?, "tokens"?, "code"?, "scenarios" }
```

* `nodes[]`: `{id,label,kind,group?,state?,hidden?,pos?}`; `edges[]`: `{id?,from,to,label?,arrow?,dashed?,hidden?}`.
* `arrays[]`: `{id,label?,values,keys?,orientation?}`; `grids[]`: `{id,rows,rowLabels?,colLabels?}`; `tokens[]`: `{id,label?,at}`; `code[]`: `{id,title?,language,code,pos?}`.
* `scenarios[]`: `{id,title,branchFrom?:{scenario,afterStep},steps:[{id,title,narration,detail?,actions,hold?}]}`.
* Actions are `{"do":"send","from":"orch","to":"payment","label":"Charge"}`; the DSL verbs above map 1:1 (`"do":"state"`, `"do":"show"`, `"do":"hide"`, `"do":"label"`, `"do":"pulse"`, `"do":"effect"`, `"do":"focus"`, `"do":"callout"`, `"do":"send"`, `"do":"move"`, `"do":"swap"`, `"do":"values"`, `"do":"highlight"`) (`targets` arrays, `start:"with"`, `delay`, `dur`, `ease`).
* Closed objects only: extra keys are errors. The JSON Schema is served at `/schema/flow-2.1.json`.
