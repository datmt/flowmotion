## Why it exists

A model with enough parameters can drive its error on the training set almost to zero simply by memorising every example, including random measurement noise. Because that noise does not repeat on new inputs, an unconstrained model that looks accurate during training often performs poorly in production. **Regularisation**—such as L2 weight penalties and early stopping—constrains model complexity so optimisation favours smooth patterns that generalise to unseen data.

## How it works

Detecting and preventing overfitting requires separating the data used to update weights from the data used to evaluate generalisation, then penalising excessive weight magnitudes.

In **Step 1, "Hold out a validation set"**, the dataset is partitioned into a training split and a held-out validation split. Weights begin small (`||w|| = 1.0`), and the validation split is strictly excluded from parameter updates.

In **Step 2, "Early epochs learn real signal"**, by epoch 10 both training loss (`0.24`) and validation loss (`0.27`) fall together. Because error drops on held-out examples as well as training examples, the model is learning genuine underlying structure.

In **Step 3, "L2 penalty restrains weight growth"**, adding the L2 regularisation term `alpha * ||w||^2` (known as **Ridge** in linear regression and **weight decay** in neural networks) forces the optimiser to keep coefficients modest unless a larger weight earns a meaningful drop in data-fit error. By epoch 20, the weight norm stays controlled at `4.4` while validation loss improves to `0.21`.

In **Step 4, "Early stopping saves best checkpoint"**, once validation loss stops improving, training halts and saves the checkpoint from the lowest validation loss (`0.21`), leaving a narrow gap against training loss (`0.18`).

## What goes wrong

Without complexity constraints, extra epochs turn from helpful learning into memorisation. In the **No regularisation: overfits training noise** branch, the L2 penalty is set to `alpha = 0` and training continues past the validation minimum.

In **Step 5, "Remove penalty and keep training"**, the unconstrained weights balloon to `||w|| = 14.6` by epoch 40. Training loss drops further to `0.06`, yet validation loss reverses direction and rises to `0.45`.

In **Step 6, "Validation loss rebounds sharply"**, by epoch 80 training loss reaches `0.02` while validation loss climbs to `0.68` and `||w||` hits `26.2`. This U-shaped validation curve reflects the **bias-variance tradeoff**: variance grows much faster than training bias shrinks.

In **Step 7, "Fails on unseen production data"**, shipping the final checkpoint deploys a high-variance model whose predictions swing wildly on small input perturbations.

## In practice

In linear models, scikit-learn's `Ridge` minimises `||y - Xw||_2^2 + alpha * ||w||_2^2`, shrinking correlated or noisy feature weights smoothly toward zero (unlike Lasso / L1, which drives coefficients all the way to zero for feature selection). Because L2 penalises raw coefficient size, features should be standardised first, and `alpha` is tuned by cross-validation (e.g., `RidgeCV`):

```python
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import RidgeCV

model = make_pipeline(StandardScaler(), RidgeCV(alphas=[0.1, 1.0, 10.0]))
model.fit(X_train, y_train)
```

In neural networks, Michael Nielsen's Chapter 3 highlights three complementary regularisers: L2 weight decay (often via `weight_decay` in the optimiser), **dropout** (randomly zeroing hidden activations during training so neurons cannot co-adapt), and **early stopping** based on held-out validation metrics.

## Pitfalls

- **Applying L2 regularisation without scaling features.** Features with smaller numerical ranges require larger coefficients to contribute equally, so unscaled L2 penalises them unfairly.
- **Setting `alpha` too high and causing underfitting.** Excessive regularisation shrinks weights so close to zero that the model cannot capture true signal (high bias, high training and validation error).
- **Selecting hyperparameters repeatedly on the test set.** Tuning `alpha` or stopping epochs against the final test set leaks evaluation information; keep a separate validation split (or cross-validation) for tuning and reserve the test set for one final check.
- **Regularising bias terms.** Intercepts shift the baseline prediction rather than controlling slope curvature; penalising biases adds unnecessary bias without reducing variance.

## Further reading

- [scikit-learn User Guide — Ridge regression and classification](https://scikit-learn.org/stable/modules/linear_model.html#ridge-regression-and-classification)
- [Neural Networks and Deep Learning, Chapter 3: Improving the way neural networks learn — Michael Nielsen](http://neuralnetworksanddeeplearning.com/chap3.html)
