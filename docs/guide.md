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
# node options: in= state= pos= hidden
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

Rules: 2-space indent; a line starting with `#` is a comment (no trailing comments); strings are double-quoted (`\"`, `\n`); a bare word is a string, so cell values are always strings (`1` is "1"). Lists are comma-joined without spaces (`a,b#2..4`). Options are `key=value` or bare flags. Values of `array` and `values` go after a bare `=`. Each step has one quoted narration line, then one action per line. Errors come back with line and column and a hint.

## Entities and ids

* `node` kinds: service, state, decision, db, queue, actor, external, value (tree/graph vertex, neuron). Edge id defaults to `from-to`; set `id=` if duplicates exist.
* `keys=` on an array makes named cells (a variables panel). Layout: `layered` (default), `tree` (BSTs, use `direction=TB`), `stress` (general graphs). `edges=straight` draws diagonal lines instead of orthogonal routes, best for fully connected graphs like neural nets.
* States: idle, active, success, error, warning, pending, disabled.
* IDs: kebab-case `^[a-z][a-z0-9-]{0,39}$`, unique across the whole document. Reference by id, never by position.
* Refs: entity id, or cell `nums#3`, range `nums#2..5` (in target lists only), keyed `vars#lo`, grid `dp#1.2`.
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
| focus | `focus orch,payment dim`; bare `focus` = full view |
| callout | `callout orch "Owns the transaction"` (<= 120 chars, ends with its step) |
| send | `send orch > payment "Charge"` (needs an edge either way; `via=id` if several; `token=id` moves a token) |
| move | `move lo to nums#5` (pointer jump, no edge needed) |
| swap | `swap nums#0 nums#1` (same array or grid) |
| values | `values stack dur=1 = a b` (push, pop, enqueue; unchanged values stay put) |
| highlight | `highlight src "3-5,9"`; `""` clears |

State persists across steps; `callout`, `pulse` and packets end with their step. Cell refs are checked against the array length at that moment.

## Workflow

1. Call `flow_guide` once. Optionally `flow_get` (`view:"dsl"`) the closest template.
2. Plan: entities, a happy-path scenario, and the failure or edge case worth showing as a branch.
3. Up to ~40 entities: `flow_create` with the full `dsl`. Larger: `flow_create` with entities and the first scenario, then one `flow_edit` per remaining scenario (incremental).
4. Fix **every** reported error in one follow-up call. Syntax issues carry `line`/`col`; all issues have a `where` and a `hint`. `flow_edit` takes `ops` for small changes or a whole new `dsl`.
5. `flow_preview` returns one contact sheet per scenario: **look at every one** (branches too), then fix layout, clarity and every lint warning with `flow_edit`. Don't ship with `edge_label_overlap`, `edge_label_over_node` or `diagram_too_small` unfixed.
6. Give the user the viewer URL.

Layout tips: keep to ~8 nodes per scenario view and at most one edge between a pair of nodes. Edge labels are static captions, so label only edges that need a name; show messages with `send ... "label"` (a moving packet) instead of labelling every edge. Meshes (cluster peers) read best with `edges=straight`; use `noarrow` for symmetric links.

Tips: 3-8 steps per scenario; one idea per step; narration explains *why*, not what moved. Use `with` to run label updates beside the motion. Add a branch (`branchFrom`) for "what if it fails?".

## Common errors

* `unknown_ref`: id not defined; check spelling and that it's an entity id.
* `no_edge` on `send`: add the edge, or use `move` for pointers.
* `ambiguous_edge`: several edges match; set `via`.
* `cell_out_of_bounds`: index past the array length at that step; `values` first.
* `duplicate_id`: ids are unique across nodes, edges, groups, arrays, steps, scenarios.
* `schema`: extra key, id not kebab-case, or text over its limit.
* Hidden entity used before `show`: add a `show` action first.

## Templates (`flow_get` by id)

* `circuit-breaker`: closed, open, half-open states with a recovery branch.
* `saga-compensation`: orchestrated saga with a compensation branch.
* `temporal-replay`: worker crash, replay of event history.
* `retry-backoff-dlq`: exponential backoff, then dead-letter queue.
* `oauth-pkce`: authorization code + PKCE, and a stolen-code branch.
* `binary-search`: pointers, a variables panel and code highlight.
* `backprop`: forward pass, loss, gradients, and a high-learning-rate branch.
* `raft-consensus`: leader election, quorum log replication, then a leader-crash branch and a network-partition branch (5 servers, role/term panels, per-node logs).

## Appendix: JSON FlowDoc

`doc` is the same model as JSON, version `"2.1"`:

```
{ "version":"2.1", "meta":{title,summary?,theme?,aspect?}, "layout"?:{algorithm?,direction?,edges?},
  "groups"?, "nodes", "edges", "arrays"?, "grids"?, "tokens"?, "code"?, "scenarios" }
```

* `nodes[]`: `{id,label,kind,group?,state?,hidden?,pos?}`; `edges[]`: `{id?,from,to,label?,arrow?,dashed?,hidden?}`.
* `arrays[]`: `{id,label?,values,keys?,orientation?}`; `grids[]`: `{id,rows,rowLabels?,colLabels?}`; `tokens[]`: `{id,label?,at}`; `code[]`: `{id,title?,language,code,pos?}`.
* `scenarios[]`: `{id,title,branchFrom?:{scenario,afterStep},steps:[{id,title,narration,actions,hold?}]}`.
* Actions are `{"do":"send","from":"orch","to":"payment","label":"Charge"}`; the DSL verbs above map 1:1 (`"do":"state"`, `"do":"show"`, `"do":"hide"`, `"do":"label"`, `"do":"pulse"`, `"do":"focus"`, `"do":"callout"`, `"do":"send"`, `"do":"move"`, `"do":"swap"`, `"do":"values"`, `"do":"highlight"`) (`targets` arrays, `start:"with"`, `delay`, `dur`, `ease`).
* Closed objects only: extra keys are errors. The JSON Schema is served at `/schema/flow-2.1.json`.
