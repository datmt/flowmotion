## Why it exists

Real neural-network loss landscapes rarely look like round bowls; instead, they contain long, narrow ravines where curvature is steep along some parameters and nearly flat along others. Plain **stochastic gradient descent (SGD)** applies a single global learning rate to every parameter, forcing an uncomfortable trade-off between violent oscillation across steep walls and painfully slow progress along the valley floor. **Momentum** and **Adam** modify the update rule using gradient history so optimisation stays stable across steep directions while moving briskly toward the minimum.

## How it works

To see why history and per-parameter scaling matter, consider the elongated valley `L(x, y) = 0.5x^2 + 10y^2`, where curvature is 20 times steeper along `y` than along `x`.

In **Step 1, "Ill-conditioned ravine"**, starting at `(-4.0, 1.0)` gives `gx = -4.0` and `gy = +20.0`. The raw gradient points heavily sideways across the canyon rather than straight toward the minimum at `(0, 0)`.

In **Step 2, "Momentum smooths direction (β₁ = 0.9)"**, the optimiser maintains an exponentially decaying average of past gradients (`m`, the first moment). Along dimensions where gradients keep pointing the same way (`x`), velocity accumulates and accelerates progress. Along dimensions where gradients alternate sign (`y`), opposing updates cancel one another out, damping oscillation.

In **Step 3, "Adaptive scale normalises curvature (β₂ = 0.999)"**, **Adam** (Adaptive Moment Estimation) adds a second moving average (`v`) of squared gradients. After correcting for zero-initialisation bias, `sqrt(v_hat)` measures the typical gradient magnitude on each axis separately (`4.0` for `x`, `20.0` for `y`).

In **Step 4, "Balanced per-axis update"**, Adam divides `m_hat` by `sqrt(v_hat) + epsilon`. Both axes are rescaled to comparable step sizes (`+0.30` on `x`, `-0.30` on `y`), moving smoothly inward toward `(0, 0)` without leaping across the valley.

## What goes wrong

When you strip away both momentum and per-parameter scaling, plain SGD must pick a single learning rate for every coordinate. In the **Plain SGD oscillates across the ravine** branch, choosing `lr = 0.09` stays just inside the stability threshold for `y` (`lr < 0.10`), yet behaves poorly.

In **Step 5, "Step 1: one global lr overshoots y"**, `x` advances modestly from `-4.00` to `-3.64`, while `y` leaps all the way across the valley floor from `+1.00` to `-0.80`.

In **Step 6, "Step 2: gradient flips and bounces back"**, the `y` gradient reverses to `-16.0`, throwing `y` back to `+0.64` while `x` creeps only to `-3.31`. Most of the update energy is wasted zig-zagging back and forth across the steep walls.

In **Step 7, "Trapped between oscillation and crawling"**, increasing `lr` to accelerate `x` causes `y` to diverge, while decreasing `lr` enough to calm `y` makes progress along `x` glacially slow.

## In practice

In Kingma and Ba's original Adam paper (Algorithm 1), the recommended defaults are `alpha = 0.001`, `beta1 = 0.9`, `beta2 = 0.999`, and `epsilon = 1e-8`, which remain the standard starting point in modern deep learning libraries. For SGD with momentum, PyTorch's `torch.optim.SGD` exposes `momentum` (commonly set around `0.9`), `dampening`, `weight_decay`, and `nesterov=True` (Nesterov Accelerated Gradient, which evaluates the gradient at the look-ahead position and requires `momentum > 0` with `dampening == 0`):

```python
opt_sgd = torch.optim.SGD(model.parameters(), lr=1e-2, momentum=0.9, nesterov=True)
opt_adam = torch.optim.Adam(model.parameters(), lr=1e-3, betas=(0.9, 0.999), eps=1e-8)
```

Adam is widely favoured for transformers, sparse gradients, and rapid prototyping because its adaptive scaling tolerates wide parameter scale differences out of the box, whereas well-tuned SGD with momentum and a learning-rate schedule remains competitive on many computer-vision benchmarks.

## Pitfalls

- **Treating Adam's default `lr = 1e-3` as universal.** Large transformers and fine-tuning runs often require much smaller learning rates (plus warmup) to avoid early instability.
- **Using L2 penalty directly inside Adam without decoupled weight decay.** Because Adam rescales gradients by `1 / sqrt(v_hat)`, adding L2 weight decay to the raw gradient behaves differently from true weight decay; most modern setups use AdamW instead.
- **Setting Nesterov momentum with non-zero dampening.** In PyTorch's `SGD`, `nesterov=True` requires `momentum > 0` and `dampening == 0` and raises a `ValueError` otherwise.
- **Ignoring the memory overhead of optimiser states.** Plain SGD stores no per-parameter history; momentum stores one buffer (`m`) per parameter, and Adam stores two (`m` and `v`), tripling parameter memory during training.

## Further reading

- [Adam: A Method for Stochastic Optimization — Diederik P. Kingma & Jimmy Ba (arXiv:1412.6980)](https://arxiv.org/abs/1412.6980)
- [An overview of gradient descent optimization algorithms — Sebastian Ruder (arXiv:1609.04747)](https://arxiv.org/abs/1609.04747)
- [PyTorch Documentation — torch.optim.SGD](https://docs.pytorch.org/docs/stable/generated/torch.optim.SGD.html)
