# FlowMotion authoring guide

You write a **FlowDoc** (JSON, version `"2.1"`): entities plus scenarios made of steps. Layout, colors, timing and camera are automatic. Never give coordinates or absolute times.

## Schema essentials

```
{ "version":"2.1", "meta":{title,summary?,theme?,aspect?}, "layout"?:{algorithm?,direction?},
  "groups"?, "nodes", "edges", "arrays"?, "grids"?, "tokens"?, "code"?, "scenarios" }
```

* `nodes[]`: `{id,label,kind,group?,state?,hidden?}`. `kind`: service, state, decision, db, queue, actor, external, value (tree/graph vertex, neuron).
* `edges[]`: `{from,to,label?,arrow?,dashed?,hidden?}`. Edge id defaults to `from-to`; set `id` if duplicates exist.
* `arrays[]`: `{id,label?,values:string[],keys?,orientation?}`. `keys` makes named cells (a variables panel).
* `grids[]`: `{id,rows:string[][],rowLabels?,colLabels?}`. `tokens[]`: `{id,label?,at}` persistent pointers. `code[]`: `{id,language,code}`.
* `scenarios[]` (1-8): `{id,title,branchFrom?:{scenario,afterStep},steps}`. `steps[]` (1-40): `{id,title,narration,actions (0-12),hold?}`. Narration is required (≤ 400 chars, plain text, `code`, **bold**).
* States: idle, active, success, error, warning, pending, disabled. Layout: `layered` (default), `tree` (BSTs, use `TB`), `stress` (general graphs).
* IDs: kebab-case `^[a-z][a-z0-9-]{0,39}$`, unique across the whole document.
* Refs: entity id, or cell `nums#3`, range `nums#2..5` (in `targets` only), keyed `vars#lo`, grid `dp#1.2`.
* Limits: 300 entities, 64 cells per array, 16x16 per grid, 180 s per scenario.

## The six design rules

1. Semantic, not geometric: pick a `kind` and a `state`, never a shape or color.
2. No coordinates: ELK lays it out. `pos` is for human pins only.
3. No absolute time: actions run in sequence; steps in order.
4. Stable string IDs, by name (`inventory`), referenced by ID, never by array index.
5. Closed objects only, no extra keys.
6. One way to do each thing: one action per effect.

## Actions (`do`)

Common timing keys on any action: `start` (`"after"` default, or `"with"`), `delay`, `dur`, `ease`.

| Action | Example |
|---|---|
| `state` | `{"do":"state","targets":["payment","nums#0..2"],"state":"error"}` |
| `show` | `{"do":"show","targets":["attacker"]}` (reveals hidden entities, edges by id) |
| `hide` | `{"do":"hide","targets":["tmp"]}` |
| `label` | `{"do":"label","target":"vars#lo","text":"5"}` (node, edge or cell text) |
| `pulse` | `{"do":"pulse","targets":["nums#4"]}` (attention bump; use for comparisons) |
| `focus` | `{"do":"focus","targets":["orch","payment"],"dim":true}`; `[]` = full view |
| `callout` | `{"do":"callout","target":"orch","text":"Owns the transaction"}` (≤ 120 chars, ends with its step) |
| `send` | `{"do":"send","from":"orch","to":"payment","label":"Charge"}` (needs an edge either way; `via` if several; `token` moves a token) |
| `move` | `{"do":"move","token":"lo","to":"nums#5"}` (pointer jump, no edge needed) |
| `swap` | `{"do":"swap","a":"nums#0","b":"nums#1"}` (same array or grid) |
| `values` | `{"do":"values","target":"stack","values":["a","b"]}` (push, pop, enqueue; unchanged values stay put) |
| `highlight` | `{"do":"highlight","target":"code","lines":"3-5,9"}`; `""` clears |

State persists across steps; `callout`, `pulse` and packets end with their step. Cell refs are checked against the array length at that moment.

## Workflow

1. Call `flow_guide` once. Optionally `flow_get` the closest template.
2. Plan: entities, a happy-path scenario, and the failure or edge case worth showing as a branch.
3. Up to ~40 entities: `flow_create` with the full doc. Larger: `flow_create` with entities and the first scenario, then one `flow_edit` per remaining scenario (incremental).
4. Fix **every** reported error in one follow-up call. Each issue has a JSON Pointer `path`, a `where` and a `hint`.
5. `flow_preview`; fix layout, clarity and lint warnings with `flow_edit`.
6. Give the user the viewer URL.

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
