# Authoring eval: JSON vs DSL (F38)

Claude Code (`claude-sonnet-5-5`), 20 prompts (`evals/prompts.json`), one fresh `claude -p` run per prompt
per format, only the flowmotion MCP tools. Raw rows: `2026-11-18-claude-code.jsonl`.
Format forced by a prompt suffix (`doc` vs `dsl`); the guide is the same in both arms (DSL-first, JSON appendix).

| Metric | JSON | DSL |
|---|---|---|
| Valid within 3 create/edit calls | 20/20 | 20/20 |
| First-try valid | 7/20 (35 %) | 17/20 (85 %) |
| Median create/edit calls to valid | 2 | 1 |
| Median total tool calls | 3 | 2 |
| Median output tokens / run | 2863 | 1429 |
| Mean output tokens / run | 2720 | 1515 (-44 %) |
| Median lint warnings on the valid doc | 0 | 0 |

## Recommendation

**DSL is the default format** (already the guide's primary form; keep JSON `doc` as the appendix/fallback).
It halves output tokens and needs one fewer round trip in most runs; JSON's first-try failures are the cost
driver. Lint quality is equal.

## Caveats

* Single client/model; ChatGPT/Cursor/Claude web runs are manual (`evals/manual.md`) and not done, so the
  §5.5 gate's multi-client and clarity criteria are **not** evaluated (no clarity ratings entered, `pass` is false by that alone).
* n=20 per arm, one run each. Token counts are `output_tokens` of the whole run (includes the final summary).
* Harness notes: server write rate limit raised for evals; runs where the model printed pseudo tool calls as
  text (0 real calls) are retried up to 2x (none needed in the final data). An earlier partial run hit the
  account usage limit mid-way; unfinished rows were discarded and resumed.
