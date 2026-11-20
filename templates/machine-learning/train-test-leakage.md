## Why it exists

A held-out test set exists for one purpose: to estimate how well a model will perform on truly unseen future inputs. **Data leakage** breaks that contract whenever information from outside the training set—such as test-set distribution statistics or post-outcome target proxies—creeps into model training. Leaked models look extraordinarily accurate during offline evaluation yet fail abruptly once deployed, making leakage one of the costliest bugs in applied machine learning.

## How it works

Preventing leakage requires enforcing a strict boundary between training and evaluation across every preprocessing and modelling step.

In **Step 1, "Split raw data before any preprocessing"**, the raw dataset is partitioned into `X_train` and `X_test` before any scaling, imputation, encoding, or feature selection runs.

In **Step 2, "Fit transformers on X_train only"**, `StandardScaler` computes its mean (`mu`) and standard deviation (`sigma`) exclusively on `X_train`, ensuring zero statistical information from `X_test` influences training features.

In **Step 3, "Transform X_test with frozen train stats"**, the held-out `X_test` rows are scaled via `.transform()` using the frozen parameters learned from `X_train`, then scored by the trained model.

In **Step 4, "Test metric predicts production performance"**, the offline test AUC (`0.84`) tracks live production AUC (`0.83`) closely because the test split faithfully mimics unseen production inputs.

## What goes wrong

Leakage typically enters in two ways: **preprocessing before splitting** (train-test contamination) and **target leakage** (including features recorded after the target event). In the **Leaked preprocessing and target proxy** branch, both mistakes happen together.

In **Step 5, "Fit scaler before split + include target proxy"**, running `scaler.fit_transform(X)` over the entire dataset bakes `X_test`'s mean and variance into `X_train`, while keeping a post-event column (such as `refund_flag` recorded only after a transaction fails) hands the model a direct proxy for the label.

In **Step 6, "Offline test score jumps artificially to 0.98"**, the model latches onto the leaked signal and reports an inflated `0.98` test AUC—tricking the team into promoting it over the clean `0.84` baseline.

In **Step 7, "Production AUC crashes when leakage disappears"**, live requests arrive without future outcome columns and from genuinely unseen distributions, collapsing real-world AUC from `0.98` down to `0.61`.

## In practice

Scikit-learn's official common-pitfalls guide recommends wrapping every transformer and estimator inside a `Pipeline` so `.fit()` only ever sees the active training subset—including inside every fold of `cross_val_score` or `GridSearchCV`:

```python
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)
pipe = make_pipeline(StandardScaler(), LogisticRegression())
scores = cross_val_score(pipe, X_train, y_train, cv=5)
pipe.fit(X_train, y_train)
```

For time-series or grouped datasets (such as multiple rows per user), use temporal splits (`TimeSeriesSplit`) or `GroupKFold` rather than random shuffling so future timestamps or duplicate entities never straddle train and test splits.

## Pitfalls

- **Running `StandardScaler`, imputation, PCA, or feature selection before `train_test_split` or cross-validation.** Any step that inspects `X` or `y` to compute statistics must live inside the training-only `Pipeline`.
- **Randomly splitting time-ordered data.** Shuffling chronological records lets the model train on next week's patterns to predict yesterday's events.
- **Including features updated after prediction time.** Columns like `account_closed_date` or `support_ticket_count` often reflect consequences of the label rather than causes known at inference time.
- **Using `GroupKFold`-blind splits when entities repeat.** If the same patient, user, or document appears in both train and test sets, the model can memorise entity identity instead of generalising to new entities.

## Further reading

- [scikit-learn User Guide — Common pitfalls and recommended practices: Data leakage](https://scikit-learn.org/stable/common_pitfalls.html#data-leakage)
