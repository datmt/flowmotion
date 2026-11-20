## Why it exists

Attention alone can mix information across token positions, yet stacking dozens of bare attention and feed-forward layers fails to train reliably because signal magnitudes drift and gradients shrink or explode with depth. The **Transformer block** packages **Multi-Head Attention** and a position-wise **Feed-Forward Network** inside two pairs of **Layer Normalization** and **residual (skip) connections**, creating a repeatable building block that trains stably even when stacked dozens or hundreds of layers deep.

## How it works

Modern large language models typically use the **Pre-LN** block layout analysed by Xiong et al., applying Layer Normalization before each sub-layer while keeping the residual path clean.

In **Step 1, "Normalise and mix tokens with attention"**, the input representation `x` is normalised across its feature dimension by **LayerNorm 1** (normalising each token independently rather than across the mini-batch) and passed into **Multi-Head Attention**, which routes context between tokens.

In **Step 2, "First residual adds identity shortcut"**, the identity skip connection adds the untouched input `x` directly to the attention output: `h = x + MHA(LN(x))`. Following He et al.'s residual learning principle, the sub-layer only has to learn an incremental update (residual delta) on top of the existing representation rather than rebuilding it from scratch.

In **Step 3, "Feed-forward sub-layer and second skip"**, `h` passes through **LayerNorm 2** and a position-wise **Feed-Forward Network** (two linear projections separated by a non-linearity, applied independently to each token), and a second skip connection adds `h` back: `out = h + FFN(LN(h))`.

In **Step 4, "Identity skips form a gradient highway"**, backpropagation through the additive skip yields `d(x + F(x))/dx = 1 + dF/dx`. That additive `1` term preserves an unobstructed path for gradients across a 24-block stack, keeping gradient norms healthy (`1.00 -> 0.91 -> 0.84`) all the way back to Layer 1.

## What goes wrong

Removing the residual shortcuts turns a deep Transformer into an ordinary plain network, exposing the **degradation problem** identified by He et al. In the **Residual connections removed** branch, both skip connections are deleted right after the first attention pass.

In **Step 5, "Remove both residual shortcuts"**, the block computes `FFN(LN(MHA(LN(x))))` purely in series. Neither the input `x` nor the intermediate state `h` can bypass a sub-layer.

In **Step 6, "Gradients decay through 24 sub-layers"**, backpropagation must multiply the Jacobians of every sub-layer sequentially. Across 24 blocks, gradient magnitude collapses from `1.00` at Layer 24 to `0.04` at Layer 12 and `0.0001` at Layer 1.

In **Step 7, "Deep stack fails to train (degradation)"**, early layers receive almost no learning signal and stall. Crucially, this is an optimisation failure rather than overfitting: even training error gets worse when more residual-free layers are added.

## In practice

Vaswani et al.'s original 2017 Transformer used **Post-LN** (`LayerNorm(x + Sublayer(x))`) with `d_model = 512` and feed-forward inner dimension `d_ff = 2048` (a `4x` expansion). Xiong et al. (2020) proved via mean-field analysis that Post-LN creates large expected gradients near output layers at initialisation, making a **learning-rate warmup** stage essential, whereas **Pre-LN** (`x + Sublayer(LayerNorm(x))`) keeps initial gradients well-behaved and trains stably even without warmup:

```python
h = x + self.mha(self.ln1(x))
out = h + self.ffn(self.ln2(h))
```

Many newer architectures refine the same skeleton—for example swapping LayerNorm for RMSNorm or using gated feed-forward layers (SwiGLU)—while keeping the dual residual-stream structure intact.

## Pitfalls

- **Training Post-LN Transformers without learning-rate warmup.** Without warmup, large initial top-layer gradients in Post-LN blocks frequently cause divergence on the first steps.
- **Forgetting a final LayerNorm after a Pre-LN stack.** Because Pre-LN leaves the residual stream unnormalised at the block output, models need one final LayerNorm before the output head.
- **Using Batch Normalization instead of Layer Normalization for variable-length sequences.** BatchNorm depends on batch statistics and padding tokens, whereas LayerNorm normalises per token across the feature dimension and behaves identically at inference time.
- **Assuming deeper stacks always improve accuracy automatically.** Even with residuals, very deep Transformers need careful residual-branch initialisation or scaling so the residual stream variance does not grow unchecked with depth.

## Further reading

- [Attention Is All You Need — Ashish Vaswani et al. (arXiv:1706.03762)](https://arxiv.org/abs/1706.03762)
- [Deep Residual Learning for Image Recognition — Kaiming He et al. (arXiv:1512.03385)](https://arxiv.org/abs/1512.03385)
- [On Layer Normalization in the Transformer Architecture — Ruibin Xiong et al. (arXiv:2002.04745)](https://arxiv.org/abs/2002.04745)
