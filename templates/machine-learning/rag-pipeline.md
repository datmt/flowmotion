## Why it exists

Pre-trained language models store world knowledge implicitly inside frozen neural weights (**parametric memory**). That makes them expensive to update when facts change, opaque when users ask where an answer came from, and prone to fluent **hallucination** on rare or private information. **Retrieval-Augmented Generation (RAG)**, introduced by Lewis et al., pairs a parametric generator with an external **non-parametric** document index so the model looks up fresh, verifiable passages before answering.

## How it works

A standard RAG pipeline splits question answering into a retrieval stage over an external corpus and a generation stage conditioned on the retrieved text.

In **Step 1, "Encode the user query"**, the user asks `"What is the refund window?"`. A dense query encoder maps the question into a vector representation (`q(x)`) in the same embedding space as the indexed documents.

In **Step 2, "Fetch top-k nearest passages"**, the vector index returns the top-`k` nearest passages (`Policy: 30d`, `Return rules`, and `Shipping FAQ`). Because the corpus lives outside the model's weights, updating company policy requires re-indexing documents rather than retraining the language model.

In **Step 3, "Combine query with retrieved context"**, the context builder packages the retrieved snippets alongside the original user question into a single augmented prompt for the generator.

In **Step 4, "Generate grounded answer"**, the language model conditions its tokens on both the query and the retrieved passages, replying `"30-day window"` with explicit provenance back to the policy document.

## What goes wrong

RAG's grounding is only as strong as its retriever. In the **Irrelevant retrieval misleads generation** branch, poor chunk boundaries, stale embeddings, or ambiguous wording cause nearest-neighbour search to miss the target document entirely.

In **Step 5, "Retriever returns off-topic chunks"**, vector search returns three superficially similar but unhelpful passages (`Gift cards`, `Store hours`, `Careers`)—none mentioning the refund window.

In **Step 6, "Unfiltered noise enters the prompt"**, because there is no relevance cutoff or cross-encoder reranker in front of the generator, those noisy passages flow straight into the context window.

In **Step 7, "Generator guesses or hallucinates"**, with no authoritative fact in its prompt, the generator either falls back on outdated parametric memory or stitches together unrelated details, producing a plausible-sounding but incorrect `"14 days"` answer.

## In practice

Lewis et al.'s original RAG formulation coupled **Dense Passage Retrieval (DPR)** over a Wikipedia vector index with a pre-trained **BART** sequence-to-sequence generator, introducing two variants: **RAG-Sequence** (conditioning the full output sequence on the same retrieved document) and **RAG-Token** (allowing each generated token to draw from a different retrieved passage). In modern production pipelines, retrieval typically uses hybrid search (dense vectors plus BM25 lexical matching), optional cross-encoder reranking, and an explicit abstention instruction when no passage clears a similarity threshold:

```text
RAG request flow:
  1. query_vec = embed(user_query)
  2. candidates = vector_index.search(query_vec, top_k=20)
  3. passages = rerank(user_query, candidates)[:3]
  4. if max_score(passages) < threshold: return "Not found in sources"
  5. return llm.generate(query=user_query, context=passages)
```

Evaluating retrieval recall (did the right chunk appear in top-`k`?) separately from generator faithfulness (did the answer stick to the retrieved text?) isolates whether errors come from search or synthesis.

## Pitfalls

- **Treating retrieval and generation as a single metric.** If you only measure final answer accuracy, you cannot tell whether failures stem from missing documents in the index or from the LLM ignoring retrieved evidence.
- **Chunking documents arbitrarily without preserving structure.** Splitting mid-table or mid-section separates headings from rules, leaving retrieved snippets ambiguous or incomplete.
- **Stuffing too many low-relevance chunks into the prompt.** Large `k` values add distracting text that dilutes attention and increases both token cost and hallucination risk.
- **Expecting RAG to fix stale or access-uncontrolled corpora.** An index that lags behind source-of-truth edits returns outdated facts, and missing per-user permission filtering at retrieval time leaks restricted documents into prompts.

## Further reading

- [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks — Patrick Lewis et al. (arXiv:2005.11401)](https://arxiv.org/abs/2005.11401)
