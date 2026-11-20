## Why it exists

Training a machine learning model means finding parameter values that minimise a loss function, yet neural networks and large regression models have far too many parameters to solve in closed form or search by brute force. **Gradient descent** solves this by measuring the local slope of the loss with respect to each parameter and taking repeated steps in the downhill direction. When the step size (the **learning rate**) is well chosen, those local steps reliably guide parameters into a low-loss region without ever needing a global map of the surface.

## How it works

Gradient descent repeats a three-part loop: evaluate the loss at the current parameters, differentiate the loss to obtain the gradient, and subtract a scaled copy of that gradient from the parameters.

In **Step 1, "Start away from the minimum"**, the parameter begins at `w = 0.00` on the convex bowl `L(w) = (w - 3)^2`, giving an initial loss of `9.00` with a learning rate of `lr = 0.25`.

In **Step 2, "Step 1: compute slope and move downhill"**, evaluating the derivative `dL/dw = 2(w - 3)` yields `-6.00`. Because the slope is negative, moving in the opposite direction increases `w` to `0 - 0.25 * (-6) = 1.50`, immediately cutting the loss from `9.00` to `2.25`.

In **Step 3, "Step 2: smaller slope, smaller step"**, the curve flattens as `w` nears the minimum, so the gradient halves to `-3.00`. Even though `lr` stays fixed at `0.25`, the update shrinks naturally to `+0.75`, moving `w` to `2.25` and lowering the loss to `0.56`.

In **Step 4, "Step 3: settle near the minimum"**, the gradient shrinks again to `-1.50`, advancing `w` to `2.63` (`L = 0.14`). Each iteration cuts the remaining distance to `w* = 3` in half, allowing the parameter to settle smoothly into the minimum without crossing it.

## What goes wrong

The gradient only tells the optimiser which direction slopes downhill locally; it says nothing about where the valley floor ends. In the **Learning rate too high: overshoot and diverge** branch, raising `lr` from `0.25` to `1.20` breaks convergence immediately.

In **Step 5, "Step 1 with lr = 1.2: leap past the minimum"**, the same `-6.00` gradient multiplied by `1.20` jumps `+7.20` units to `w = 7.20`. That overshoots `w* = 3` so badly that the parameter lands higher up the far wall, nearly doubling the loss from `9.00` to `17.64`.

In **Step 6, "Step 2: steeper slope flings w back across"**, the larger error creates an even steeper positive gradient (`+8.40`), which flings `w` back past the valley to `-2.88` with a loss of `34.57`.

In **Step 7, "Divergence: error grows 1.4× every step"**, every update multiplies the distance from `w* = 3` by `1 - 2 * lr = -1.4`. The parameter bounces wider on every iteration until floating-point values overflow to `NaN`.

## In practice

In real training pipelines, computing the exact gradient over the entire dataset (**batch gradient descent**) is too slow for large datasets, while updating on a single example (**stochastic gradient descent**, SGD) produces noisy steps. As Ruder's survey notes, **mini-batch gradient descent** is the standard compromise: it averages gradients over a small batch of examples (commonly between 50 and 256) to reduce update variance while exploiting vectorised matrix hardware.

```python
for x_batch, y_batch in dataloader:
    loss = criterion(model(x_batch), y_batch)
    grad = compute_gradients(loss, params)
    params = params - lr * grad
```

Because a fixed learning rate either starts too slowly or fails to settle cleanly near the end of training, practitioners pair mini-batch updates with learning-rate schedules (such as decay or cosine annealing) and momentum or adaptive methods.

## Pitfalls

- **Setting one learning rate without testing a small run first.** Too large a rate diverges within a handful of steps, while too small a rate crawls and wastes compute.
- **Using unscaled input features.** When one feature spans `[0, 1]` and another spans `[0, 10000]`, the loss surface stretches into a narrow ravine where a single learning rate either oscillates or stalls.
- **Confusing a flat loss curve with a global minimum.** Non-convex neural-network surfaces contain saddle points and poor local minima where gradients approach zero even though better solutions exist.
- **Forgetting to monitor validation loss alongside training loss.** Gradient descent minimises only the training objective; running it indefinitely can keep lowering training loss while harming generalisation.

## Further reading

- [An overview of gradient descent optimization algorithms — Sebastian Ruder (arXiv:1609.04747)](https://arxiv.org/abs/1609.04747)
- [Neural Networks and Deep Learning, Chapter 1: Using neural nets to recognize handwritten digits — Michael Nielsen](http://neuralnetworksanddeeplearning.com/chap1.html)
