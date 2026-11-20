## Why it exists

Connecting every pixel of an image directly to a dense layer explodes parameter counts and discards spatial structure—an edge in the top-left corner has to be re-learned independently in the bottom-right. **Convolutional Neural Networks (CNNs)** solve both problems by sliding small shared filters (**kernels**) across local neighbourhoods to build spatial feature maps, then using **pooling** layers to downsample those maps cleanly across deeper stages.

## How it works

A convolutional block's spatial geometry is governed by the CS231n output-size formula `W_out = floor((W - F + 2P) / S) + 1`, where `W` is the input size, `F` is the kernel size, `P` is border zero-padding, and `S` is stride.

In **Step 1, "Add zero-padding around borders"**, a `4 x 4` input is padded with `P = 1` zeros on every edge (`6 x 6` total). Setting `P = (F - 1) / 2` for an odd kernel (`F = 3`) lets the filter centre cleanly on edge pixels rather than shrinking the image at every layer.

In **Step 2, "Slide 3×3 filter with stride S = 1"**, moving the `3 x 3` kernel one pixel at a time yields `(4 - 3 + 2 * 1) / 1 + 1 = 4`, preserving the `4 x 4` spatial dimensions (`"same"` padding) while sharing one compact set of filter weights across all positions.

In **Step 3, "Slide to every position"** and **Step 4, "Finish the last positions"**, the same kernel visits all `16` windows and fills the `4 x 4` feature map one number at a time.

In **Step 5, "Downsample with 2×2 max pooling"**, a `2 x 2` MaxPool layer with stride `S = 2` keeps only the largest activation in each non-overlapping `2 x 2` region (`[8, 8; 6, 9]`), cutting spatial area by `4x` and adding local shift tolerance.

In **Step 6, "Emit compact, aligned feature map"**, the resulting `2 x 2` feature map feeds smoothly into the next stage with predictable dimensions.

## What goes wrong

Small arithmetic slips in padding or stride break spatial alignment—often silently at first, then fatally downstream. In the **Stride/padding mismatch drops borders** branch, padding is removed (`P = 0`) and stride is raised to `S = 2` on the same `4 x 4` input with a `3 x 3` filter.

In **Step 7, "Drop padding (P = 0) and set stride S = 2"**, the formula yields `(4 - 3 + 0) / 2 + 1 = 1.5`, which is not an integer—the filter does not tile evenly across the input.

In **Step 8, "Floor division silently discards borders"**, frameworks such as PyTorch apply floor division (`floor(1.5) = 1`), producing a `1 x 1` feature map. No warning is raised, yet the entire rightmost column and bottom row of pixels are never visited by the filter.

In **Step 9, "Downstream pooling fails on 1×1 map"**, handing that `1 x 1` activation map to a `2 x 2` MaxPool layer (or adding it to a `2 x 2` residual skip branch) triggers a runtime shape error.

## In practice

In PyTorch's `torch.nn.Conv2d`, setting `padding=(kernel_size - 1) // 2` with `stride=1` preserves spatial dimensions for odd kernels (`F = 3 -> P = 1`, `F = 5 -> P = 2`), which makes stacking deep stages and residual skip connections straightforward:

```python
import torch.nn as nn

block = nn.Sequential(
    nn.Conv2d(in_channels=3, out_channels=16, kernel_size=3, stride=1, padding=1),
    nn.ReLU(),
    nn.MaxPool2d(kernel_size=2, stride=2),
)
```

CS231n recommends checking `(W - F + 2P) % S == 0` for every layer in a CNN architecture—especially before downsampling stages—so no border pixels are silently dropped and feature maps divide cleanly by powers of two.

## Pitfalls

- **Relying on implicit floor division without checking divisibility.** When `(W - F + 2P)` is not divisible by `S`, edge pixels are quietly ignored and can introduce subtle asymmetric spatial shifts across layers.
- **Stacking unpadded (`P = 0`) convolutions in deep networks.** Without padding, every `3 x 3` layer shaves two pixels off height and width, shrinking small feature maps rapidly and under-representing border information.
- **Confusing spatial size with channel depth.** Changing `out_channels` changes the depth of the activation tensor (number of filters), not its height or width; spatial size depends only on `W`, `F`, `P`, `S`, and dilation.
- **Forgetting that pooling has no learned parameters, unlike strided convolution.** Max pooling discards non-maximal activations deterministically, whereas strided convolutions learn how to downsample—mixing up their padding defaults easily causes off-by-one shape mismatches in encoder-decoder networks.

## Further reading

- [Stanford CS231n — Convolutional Neural Networks for Visual Recognition](https://cs231n.github.io/convolutional-networks/)
- [PyTorch Documentation — torch.nn.Conv2d](https://docs.pytorch.org/docs/stable/generated/torch.nn.Conv2d.html)
