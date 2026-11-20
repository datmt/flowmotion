## Why it exists

A standalone language model is cut off from live databases, order systems, and code execution; it can only generate text from its training weights and prompt. **LLM agent tool-calling loops** let the model inspect schemas of external functions, request structured calls when live facts or actions are needed, and fold real execution outputs back into its reasoning—turning passive text generation into grounded, multi-step problem solving.

## How it works

A tool-calling agent runs a stateful loop between the model and a host application runtime that owns actual execution and permissions.

In **Step 1, "Send prompt + tool schemas to LLM"**, the user asks `"Check order #42"`. The host sends the conversation along with JSON schemas describing available tools (such as `get_order(id)`).

In **Step 2, "LLM returns structured tool_use block"**, rather than fabricating a status, the model halts with `stop_reason: "tool_use"` and returns a structured `tool_use` block containing a unique `tool_use_id` (`t1`) and arguments (`{"id": 42}`).

In **Step 3, "Host runs tool and returns tool_result"**, the host runtime executes `GET /orders/42` against the external API, captures `{status: "shipped"}`, and posts a follow-up request appending a `tool_result` block linked to exact ID `t1`.

In **Step 4, "LLM finishes with end_turn"**, reading the grounded tool payload, the model generates a concise user reply and stops with `stop_reason: "end_turn"`.

## What goes wrong

External APIs time out, reject malformed parameters, or return permission errors regularly. In the **Tool fails: `is_error` lets LLM recover** branch, `GET /orders/42` fails with a `504 Timeout` right after the model issues `tool_use t1`.

In **Step 5, "External API times out"**, throwing an unhandled exception would abort the user session, while dropping `t1` from history would violate the API contract requiring every `tool_use` to be paired with a `tool_result`.

In **Step 6, "Return tool_result with is_error: true"**, the runtime catches the failure and returns a valid `tool_result` referencing `t1` with `is_error: true` and a plain, actionable description rather than a noisy stack trace.

In **Step 7, "LLM adapts with fallback or honest reply"**, seeing `is_error: true` natively in context, the model adjusts its plan—either fixing arguments, invoking a fallback tool within its turn budget, or honestly explaining the outage to the user.

## In practice

Anthropic's tool-use specification returns failures in the exact same `tool_result` message structure with `is_error: true` so the conversation stays schema-valid and self-healing:

```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_01A09q90qw90lq917835lq9",
      "is_error": true,
      "content": "Error: Order API timed out for order #42. Try fallback lookup or inform user."
    }
  ]
}
```

Production agent harnesses pair structured tool errors with strict guardrails: a hard **maximum iteration / turn cap** (preventing infinite retry loops), per-tool timeouts, schema validation of model-supplied arguments before execution, and human confirmation gates for destructive actions.

## Pitfalls

- **Omitting `tool_result` when a tool throws an exception.** Leaving a `tool_use_id` unanswered breaks API history validation on the very next turn; always reply with a matching `tool_result` and `is_error: true`.
- **Returning raw stack traces or vague `"Error"` strings.** Stack traces waste context tokens and confuse the model, whereas concise, actionable errors tell it whether to fix parameters, retry, or stop.
- **Running an unbounded `while stop_reason == "tool_use"` loop.** Without a max-turn limit and budget cap, a flaky tool or stubborn model can spin indefinitely and burn API quota.
- **Overloading the agent with dozens of overlapping tool schemas.** Ambiguous tool descriptions cause frequent mis-selections; clear, minimal tool interfaces with explicit error messages outperform sprawling toolboxes.

## Further reading

- [Anthropic Engineering — Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- [Anthropic Documentation — Tool use overview](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview)
