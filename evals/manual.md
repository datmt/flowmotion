# Manual eval clients

Claude web/desktop, ChatGPT, Cursor: add the server (`/mcp`, no auth), paste each prompt from
`prompts.json` plus the format hint from `run-claude-code.ts`, and append one JSON line per run to
`evals/results/<date>-<client>.jsonl`:

`{"prompt","client","format","toolCalls","callsToValid","flowId","url","outputTokens","warnings","clarity"}`

`callsToValid` = number of flow_create/flow_edit calls up to the first success (`null` if none).
`clarity` = your 1-5 rating of the viewer. Then `node --experimental-strip-types evals/report.ts evals/results/*.jsonl`.
