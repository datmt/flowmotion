## Why it exists

Recurrent neural networks pass sequence context step by step through a hidden state, which prevents parallel training across token positions and makes long-range dependencies hard to preserve across many steps. **Scaled dot-product self-attention**, introduced in Vaswani et al.'s *"Attention Is All You Need"*, replaces sequential recurrence with direct all-to-all comparisons between tokens. In a single parallel operation, every token can gather relevant information from any other position regardless of distance.

## How it works

Self-attention maps a sequence of token embeddings to contextualised outputs via `Attention(Q, K, V) = softmax(Q K^T / sqrt(d_k)) V`, illustrated on the three-token sequence `["The", "cat", "sat"]`.

In **Step 1, "Project embeddings into Q, K, and V"**, each input vector is multiplied by learned projection matrices to produce three roles: a **Query** (`Q`, what this token is looking for), a **Key** (`K`, what this token offers to match against), and a **Value** (`V`, the content passed forward when matched).

In **Step 2, "Score compatibility and scale by √d_k"**, the dot product `Q K^T` scores every query against every key, forming a `3 x 3` compatibility grid. Dividing by `sqrt(d_k)` (where `d_k` is the key dimension) prevents dot products from growing large in magnitude as `d_k` increases, which would otherwise push softmax into flat saturation regions with vanishing gradients.

In **Step 3, "Normalise each row with softmax"**, applying softmax across each row turns raw scores into non-negative attention weights summing to `1.00`. In bidirectional encoder attention, every token can attend to every other token in both directions.

In **Step 4, "Combine values into contextual outputs"**, multiplying the weight matrix by `V` yields each token's new representation—for example, `sat` forms a weighted blend drawing `55%` from `cat`, `30%` from `sat`, and `15%` from `The`.

## What goes wrong

Bidirectional attention breaks autoregressive language modelling, where a decoder must predict each next token using only the tokens that came before it. In the **Decoder causal mask blocks future tokens** branch, training a decoder in parallel over the whole target sequence exposes a subtle bug if future positions stay visible.

In **Step 5, "Unmasked scores leak future tokens"**, the strictly upper-triangular entries (`col > row`) allow `The` to read `cat` and `sat`, and `cat` to read `sat`. During parallel teacher-forced training, the model could simply copy the answer from the future position instead of learning to predict it.

In **Step 6, "Mask future positions to −∞ before softmax"**, the decoder adds a **causal mask** setting every future entry (`col > row`) to `-inf` *before* softmax.

In **Step 7, "Softmax turns −∞ into exact 0.00"**, `exp(-inf)` evaluates to exact zero, and softmax renormalises only the permitted past-and-present positions: `The` puts `1.00` weight on itself, `cat` splits weight between `The` and `cat`, and `sat` attends across all three tokens.

## In practice

Transformers rarely run a single attention head; instead, **Multi-Head Attention** runs `h` smaller projections in parallel (in Vaswani et al.'s base model, `h = 8` heads with `d_k = d_v = 64` inside `d_model = 512`) so different heads can specialise in different relationships before concatenating and projecting their outputs:

```python
scores = (Q @ K.transpose(-2, -1)) / math.sqrt(d_k)
if causal:
    scores = scores.masked_fill(mask == 0, float("-inf"))
weights = torch.softmax(scores, dim=-1)
output = weights @ V
```

Because naive self-attention materialises an `N x N` score matrix for sequence length `N`, production frameworks rely on IO-aware fused kernels (such as FlashAttention) that compute exact scaled dot-product attention in tiles without storing the full `N x N` matrix in high-bandwidth GPU memory.

## Pitfalls

- **Omitting the `1 / sqrt(d_k)` scaling factor.** For large key dimensions, unscaled dot products grow in variance, causing softmax to collapse onto one-hot weights and stall gradient flow.
- **Masking after softmax instead of before.** Zeroing future weights post-softmax leaves rows summing to less than `1.0` and distorts gradients; always mask logits to `-inf` before softmax.
- **Forgetting positional information.** Self-attention is permutation-equivariant on its own—shuffling tokens shuffles outputs identically—so Transformers must inject positional encodings or rotary embeddings (RoPE).
- **Assuming attention weights scale cheaply to long contexts.** Standard self-attention takes `O(N^2)` compute and attention-matrix work in sequence length `N`, making very long sequences expensive without sparse, sliding-window, or cached-inference optimisations.

## Further reading

- [Attention Is All You Need — Ashish Vaswani et al. (arXiv:1706.03762)](https://arxiv.org/abs/1706.03762)
