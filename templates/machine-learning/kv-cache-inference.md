## Why it exists

During autoregressive generation, a decoder-only Transformer predicts one token at a time and feeds each generated token back as input. Without caching, generating token `t` would re-project and re-run every earlier token through every attention layer, turning a `T`-token response into `O(T^2)` redundant projections. Because causal masking guarantees that past tokens never depend on future tokens, their **Key (K)** and **Value (V)** tensors never change once computed—storing them in GPU memory as a **KV cache** cuts per-step generation down to a single new token.

## How it works

Autoregressive inference splits cleanly into a parallel **prefill** phase for the prompt and a sequential **decode** phase that reuses the cached tensors.

In **Step 1, "Prefill prompt in parallel"**, the prompt tokens (`The`, `cat`) are processed together in one batched forward pass. Each layer writes its resulting Key and Value vectors into VRAM slots `0` and `1`.

In **Step 2, "Decode step 1: compute only 1 new token"**, the newly sampled token (`sat`) enters the network alone. The layer projects only `q`, `k`, and `v` for `sat`, appends `KV:sat` to slot `2`, and runs causal attention against cached slots `0..2`.

In **Step 3, "Decode step 2: stream cached KV from HBM"**, token `on` repeats the pattern: project one vector, append `KV:on` to slot `3`, and stream all four cached KV entries from GPU high-bandwidth memory (HBM).

In **Step 4, "Fast decode, but VRAM-capacity bound"**, eliminating redundant recomputation shifts the bottleneck from raw arithmetic FLOPs to **memory bandwidth and VRAM capacity** as batch sizes and context lengths grow.

## What goes wrong

Every active request grows its KV cache token by token across every Transformer layer, so GPU memory eventually fills up. In the **VRAM full: cache eviction or preemption** branch, the cache has reached its four-slot ceiling.

In **Step 5, "New token hits VRAM capacity ceiling"**, token `the` needs a fresh slot, yet VRAM is already saturated. In traditional serving engines that pre-allocate contiguous buffers for each request's maximum possible length, internal and external fragmentation can exhaust memory even when most reserved slots sit empty.

In **Step 6, "Evict old KV block or swap/preempt"**, the serving engine must free physical memory immediately—either dropping early KV entries (e.g., sliding-window eviction), swapping blocks out to host CPU RAM, or preempting a request and discarding its cache to recompute later.

In **Step 7, "Context loss or recomputation latency spike"**, each choice carries a real cost: permanent token eviction strips early prefix information from attention (degrading long-context recall), while swapping or recomputation preserves exact outputs at the expense of visible latency spikes.

## In practice

Two architectural advances govern production KV-cache scaling. First, Pope et al. showed that **Multi-Query Attention (MQA)**—and its widely deployed generalisation, Grouped-Query Attention (GQA)—shares Key/Value heads across multiple Query heads to shrink the KV cache footprint dramatically (enabling much longer contexts and larger batches). Second, Kwon et al. introduced **PagedAttention** in **vLLM**, dividing each request's KV cache into non-contiguous fixed-size blocks mapped through a logical-to-physical block table:

```text
PagedAttention block mapping:
  Logical tokens: [0..15] -> Physical block #7
                  [16..31] -> Physical block #2
                  [32..39] -> Physical block #11  (allocated on demand)
```

Allocating blocks on demand drops KV-cache memory waste from roughly 60–80% in naive contiguous allocators to under 4%, enables prefix sharing across requests with identical system prompts, and improves serving throughput by 2x to 4x over earlier engines.

## Pitfalls

- **Pre-allocating contiguous `max_seq_len` buffers per request.** Most completions finish well short of the maximum limit, wasting the majority of GPU memory and capping concurrent batch size.
- **Underestimating KV cache size relative to model weights.** At long context lengths and high concurrency, KV caches can easily rival or exceed the memory footprint of the model weights themselves.
- **Confusing prefill throughput with decode latency.** Prefill is compute-bound (processing many tokens in parallel), whereas decode is memory-bandwidth-bound (streaming weights and KV cache for a single token), so batching and hardware tuning affect them differently.
- **Evicting prompt tokens blindly during sliding-window compression.** Dropping initial system instructions or early "attention sink" tokens can severely degrade output quality even when recent tokens stay cached.

## Further reading

- [Efficiently Scaling Transformer Inference — Reiner Pope et al. (arXiv:2211.05102)](https://arxiv.org/abs/2211.05102)
- [Efficient Memory Management for Large Language Model Serving with PagedAttention — Woosuk Kwon et al. (arXiv:2309.06180)](https://arxiv.org/abs/2309.06180)
