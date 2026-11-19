# Contributing

Two kinds of contribution: **flows** (content, `templates/`) and **code** (everything else). Flows are CC BY 4.0, code is MIT; by opening a PR you agree to the license of the files you touch.

## Request a flow

Open an issue with the **Flow request** form, or build one yourself (below).

## Add a flow

1. Pick a domain folder in `templates/` (`distributed-systems`, `security`, `databases`, ...) or propose a new lowercase kebab-case one in the PR. Slug: lowercase kebab-case, unique across the catalog.
2. Write it by hand or with an agent: connect the MCP server (`docs/connect.md`) and follow `docs/guide.md` (the workflow, the DSL, the lint rules). Read a neighbour first: `flow_get` with `id:"<domain>/<slug>"`, `view:"dsl"`.
3. Save as `templates/<domain>/<slug>.flow` with this header:

   ```
   flow "Title"
   summary "One sentence."
   tags kebab-case up-to-eight
   level beginner|intermediate|advanced
   source "https://..."          # repeat; the facts must be checkable here
   related <domain>/<slug>       # optional
   ```
4. Check: `pnpm install && pnpm test` (compiles every flow: 0 errors, at most 1 warning, metadata present). `node --experimental-strip-types packages/cli/src/main.ts validate <file>` for a quick one.
5. Open a PR. It is reviewed against the rubric below.

### Review rubric

* **Accurate.** Matches the `source`s. No invented behaviour, numbers or legal/financial claims.
* **Teaches why.** Narration explains why a step happens, not what moved. One idea per step, 3-8 steps per scenario.
* **Shows the failure.** At least one branch for what goes wrong, where the topic has one.
* **Clean.** No lint warnings beyond one; every scenario previewed and legible; ~8 nodes per view.
* **Scoped.** One flow per PR, only that flow's files.

### Regulated domains (banking, insurance, fintech, law, ...)

`source` must cite a primary or authoritative reference (statute, regulator, standard). Flows are illustrations, not advice; name the jurisdiction in the summary when the process is jurisdiction-specific.

## Code changes

`pnpm typecheck && pnpm test` must pass. Keep changes small and focused; see `README.md` and `PLAN.md`.
