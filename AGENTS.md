## Project overview
Animated flows across domains (FlowMotion Studio). A FlowDoc (JSON) is validated, laid out, compiled, then played in a Konva viewer.
- `prd.md` product behavior (source of truth); `PLAN.md` ordered features F00–F32 and shared contracts
- `docs/backlog.md` stored flows to generate
- `docs/guide.md` guideline on how to generate the flows when required

## Tech stack
- TypeScript (strict, ESM only), Node ≥ 22, pnpm workspace monorepo
- Zod 4 (schema), elkjs (layout), shiki (code tokens, compile-time only), Konva (player), Vite (dev/build)
- Vitest (tests), playwright-core (player e2e)
- Planned: Express 5, PostgreSQL (`pg`/PGlite in tests), MCP server, Playwright + FFmpeg render worker

## Layout
- `packages/core` schema, validate, cells, timing, layout, compile, lint; `./runtime` = types, theme, `sample()`, easing
- `packages/player` Konva player + `<flow-player>` element + dev page
- `assets/fonts` Inter + JetBrains Mono; `schema/flow-2.1.json` generated

## Guidelines
- Work from `PLAN.md`: take the first unchecked feature whose dependencies are done; one commit per feature (Conventional Commits, scope = package, e.g. `feat(core): F10 …`); tick the box in the same commit.
- Before committing run `pnpm typecheck && pnpm test`. Never commit red. Don't push unless asked.
- Everything touching a FlowDoc goes through `@flowmotion/core` — never reimplement validation, ops or compile elsewhere.
- `@flowmotion/core/runtime` must not import `zod`, `elkjs` or `shiki` (a test enforces it).
- Deterministic compiler and `sample()`: no `Date.now()`, `Math.random()`, or unordered iteration.
- Validate all untrusted input with Zod; render narration via `textContent`/canvas only, never `innerHTML`.
- Minimum code: no speculative abstraction, no new dependency for a few lines. Mark deliberate shortcuts with a `ponytail:` comment naming the ceiling and upgrade path.
- Pin exact dependency versions. Never commit secrets (`.env` is gitignored; use `.env.example`).
- If you deviate from the plan, edit `PLAN.md` in the same commit and say why in the commit body.
- Schema changes: run `pnpm gen:schema` (a test checks `schema/flow-2.1.json` is current); golden files live in `packages/core/src/__golden__`.

## Commands
- `pnpm typecheck` · `pnpm test` · `pnpm gen:schema`
- `pnpm --filter @flowmotion/player dev` — viewer dev page
- `pnpm --filter @flowmotion/player build && pnpm --filter @flowmotion/player size` — embed bundle ≤ 150 KB gzip
