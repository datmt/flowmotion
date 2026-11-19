# Writing a flow's article

Every flow has a sibling lesson: `templates/<domain>/<slug>.md`, shown beside the animation and published as its own page. The animation shows *what* happens; the article explains *why* and what the animation cannot. Write for a smart reader new to the topic.

## Workflow (one article per commit)

1. Pick a line from `templates/.articles-todo` (or the one you were given). Path = `<domain>/<slug>`.
2. Read the flow: `templates/<domain>/<slug>.flow`, or `flow_get` with `id:"<domain>/<slug>"`, `view:"dsl"`. Note its steps, branches, `level`, `sources`.
3. Read the sources. Fetch each URL; take facts only from them.
4. Read one finished article for tone: `flow_get` with `view:"article"` on any flow not in the todo file (or open its `.md`). Match it; do not copy it.
5. Write `templates/<domain>/<slug>.md` to the structure below.
6. Delete the flow's line from `templates/.articles-todo`.
7. `pnpm test`. It checks the six headings (exact text and order), 300-1100 words, no `# ` title, every flow `source` URL under Further reading, and that the todo file matches reality.
8. Commit: `docs(<domain>): article for <slug>`. Only that flow's `.md`, optional `detail` lines in its `.flow`, and the todo file.

Published as `/f/<domain>/<slug>` (the page body) and `/f/<domain>/<slug>.md`. The first paragraph becomes the meta description and the snippet AI assistants quote, so it must be accurate and self-contained.

## Inputs

Read the flow first: `templates/<domain>/<slug>.flow` (steps, branch scenarios, `sources`, `level`). Read the sources too; every factual claim must trace to one. A claim you cannot source is cut, not softened. No invented numbers, versions or legal/financial statements.

## Structure (exactly these `##` headings, in this order, no `#` title)

1. `## Why it exists`: the problem and who has it, 2-4 sentences. No definition-first openings.
2. `## How it works`: walk the happy path, naming steps as they appear (`**Step 3, "Open"**`). Explain causes, not just actions.
3. `## What goes wrong`: the failure branch(es) in the flow, and why the mechanism behaves that way.
4. `## In practice`: where real systems use it, typical defaults and tuning knobs (sourced), a minimal config or code snippet if it helps.
5. `## Pitfalls`: 3-5 bullets of common mistakes, and when *not* to use it.
6. `## Further reading`: one bullet per `source` URL in the flow, as `[Descriptive title](url)`, plus any extra you used.

## Style

* 400-900 words total. Plain Markdown: headings, paragraphs, bullets, `code`, fenced code, **bold**. No HTML, no images, no tables unless they carry real information.
* First sentence of the file (under the first heading) should stand alone: it is the excerpt search engines and AI assistants quote. State the answer, then elaborate.
* Define a term once, where it first appears. Prefer concrete examples over abstractions.
* Regulated domains (banking, fintech, insurance, construction, law): name the jurisdiction, cite primary sources, and end `## Pitfalls` with "Illustrative only, not legal/financial advice."

## Per-step detail

Where a step needs more than its 400-character narration, add `detail "..."` under the narration in the `.flow` (up to 1200 characters, shown as "Learn more"). Use it for the mechanism behind a step, not for repeating the article.

## Do not

* Invent numbers, defaults, versions, dates, statutes or quotes.
* Add a `# Title` line (the page already has the flow title as `<h1>`).
* Use HTML, images, footnotes or tables-for-layout; the page renders only headings, paragraphs, bullets, code, bold and links.
* Edit other flows' articles in the same commit.
* Pad to reach the word count; if a topic is thin, say less.

## Checklist before committing

* [ ] Headings exactly as above; every `source` URL is under Further reading
* [ ] Every number and claim traceable to a source
* [ ] Steps referenced by their real titles
* [ ] Removed the flow's line from `templates/.articles-todo` (if present)
* [ ] `pnpm test` passes
