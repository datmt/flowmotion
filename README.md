# Flowmotion

Agent-first animated explainers for flows and algorithms. An agent (or you) writes a small DSL; the compiler handles layout and timing; a player, editor and video exporter consume the result.

- **Catalog:** `templates/<domain>/<slug>.flow`, shown as a tree in the app. See `docs/guide.md` ("Adding a flow to the catalog").
- **Agents:** remote MCP at `POST /mcp` (`flow_guide`, `flow_create`, `flow_edit`, `flow_get`, `flow_preview`, `flow_export`). Setup: `docs/connect.md`.
- **Spec and plan:** `prd.md`, `PLAN.md`.

## Develop

```
pnpm install
scripts/dev.sh        # API :3000 + web :5173
pnpm test             # needs Chromium (playwright) + ffmpeg for the render suites
pnpm typecheck
```

Copy `.env.example` to `.env` for `ANTHROPIC_API_KEY` (AI generation) and optional R2 storage. Without R2, snapshots go to `packages/server/data`.

## Deploy

`Dockerfile` runs typecheck and unit tests, builds the web app, and ships a Node image with Chromium and ffmpeg (port 3000). `Jenkinsfile` builds and pushes it, then bumps the image tag in the gitops repo.
