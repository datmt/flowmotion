## Why it exists

Early neural language and translation models used fixed word-level vocabularies of 30,000 to 50,000 words so the output softmax stayed computationally tractable. Whenever an input contained a rare compound, proper noun, or morphological inflection outside that table, the model replaced it with an opaque `<unk>` token and lost the word's meaning. **Byte Pair Encoding (BPE)** solves this open-vocabulary bottleneck by learning reusable subword units that keep frequent words intact while breaking rare words into meaningful pieces.

## How it works

Originally a lossless data compression technique, BPE was adapted for neural machine translation by Sennrich, Haddow, and Birch to segment text into subwords without needing an external dictionary.

In **Step 1, "Start from character vocabulary"**, every word in the training corpus (such as `low`, `lower`, `newest`, and `widest`) is split into individual characters plus a special end-of-word boundary marker. The starting vocabulary contains only these base characters.

In **Step 2, "Merge the most frequent adjacent pair"**, the trainer counts every co-occurring adjacent symbol pair across the corpus and merges the highest-frequency pairs (`l + o -> lo`, `e + s -> es`) into new symbols, appending each rule to an ordered merge table.

In **Step 3, "Repeat merges to form stems and suffixes"**, repeating this greedy merge loop builds longer subword units (`lo + w -> low`, `es + t -> est`). Frequent words collapse into single tokens, while inflected forms split naturally into stems and suffixes (`lowest -> ["low", "est"]`).

In **Step 4, "Greedy subword encoding at inference"**, the trained encoder tokenises new text by splitting it into base symbols and applying the learned merge rules in exact training order.

## What goes wrong

The real payoff of subword tokenisation shows up when a model encounters a word that never appeared in training. In the **Unseen word: word-level `<unk>` vs BPE fallback** branch, the compound word `"lowermost"` arrives at inference time.

In **Step 5, "Fixed word vocabulary fails with `<unk>`"**, a fixed word-level vocabulary has no entry for `"lowermost"` and maps the entire token to `<unk>`. Downstream attention layers cannot tell whether the missing word was a name, a verb, or a comparative adjective.

In **Step 6, "BPE composes unseen words from known subwords"**, BPE applies its ordered merge table and segments `"lowermost"` into `["low", "er", "m", "o", "s", "t"]`. Even when the tail falls back to individual characters, the familiar root `low` and suffix `er` remain visible to the model.

In **Step 7, "Byte-level BPE eliminates `<unk>` completely"**, character-level BPE can still stumble on an unseen Unicode character or emoji; **byte-level BPE** (popularised by GPT-2) starts from the 256 raw UTF-8 byte values instead of Unicode characters, guaranteeing that arbitrary text, code, or symbols always encode without `<unk>`.

## In practice

In BPE training, the primary tuning knob is the target vocabulary size (equivalently, the number of merge operations): smaller vocabularies produce shorter embedding matrices but longer token sequences, while larger vocabularies compress common words into single tokens and reduce sequence length for self-attention.

```text
BPE training loop:
  1. Split every corpus word into base symbols (characters or UTF-8 bytes)
  2. Count all adjacent symbol pairs weighted by word frequency
  3. Merge the most frequent pair (A, B) -> AB and append to merge table
  4. Repeat steps 2-3 until vocabulary reaches target size
```

Most modern large language models (including GPT-family and Llama-family tokenisers) use byte-level BPE paired with regex pre-tokenisation rules that prevent merges across punctuation or whitespace boundaries.

## Pitfalls

- **Under-allocating merges for multilingual or code-heavy corpora.** Scripts or programming keywords that are rare in the tokeniser's training mix fragment into many short subwords or raw bytes, inflating sequence length and inference cost.
- **Assuming BPE always aligns with linguistic morphemes.** Because BPE merges purely by corpus frequency, it can split rare words in unintuitive places that hinder spelling, character counting, or arithmetic tasks.
- **Mismatched tokeniser and model weights.** Even reordering or adding a single merge rule changes token IDs downstream; training and inference must always share the exact same merge table and special-token map.
- **Ignoring whitespace and normalisation consistency.** Leading spaces matter in byte-level BPE (`" cat"` and `"cat"` map to different token IDs), so inconsistent stripping during prompt construction can subtly shift model outputs.

## Further reading

- [Neural Machine Translation of Rare Words with Subword Units — Rico Sennrich, Barry Haddow & Alexandra Birch (arXiv:1508.07909)](https://arxiv.org/abs/1508.07909)
