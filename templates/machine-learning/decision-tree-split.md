## Why it exists

Linear models struggle when relationships are non-linear or depend on feature interactions, while deep neural networks require extensive scaling and tuning on tabular data. **Decision trees** partition tabular data with simple, human-readable if-then thresholds learned directly from the training set. By choosing splits that separate classes cleanly—typically via **Gini impurity**—a tree captures non-linear decision boundaries without needing feature scaling, though its flexibility also makes it quick to overfit if left unconstrained.

## How it works

Scikit-learn's `DecisionTreeClassifier` builds binary trees using an optimised **CART (Classification and Regression Trees)** algorithm, defaulting to `criterion="gini"`. Gini impurity measures how often a randomly chosen label from a node would be misclassified if assigned according to the node's class frequencies: `Gini = 1 - sum(p_i^2)`.

In **Step 1, "Measure root Gini impurity"**, the root starts with 12 evenly mixed examples (`6A, 6B`), giving maximum binary impurity `Gini = 1 - (0.5^2 + 0.5^2) = 0.50`.

In **Step 2, "Pick split with lowest weighted Gini"**, CART evaluates candidate feature thresholds and selects `x < 5`. Both children (`5A, 1B` on the left and `1A, 5B` on the right) have impurity `1 - ((5/6)^2 + (1/6)^2) = 0.28`, cutting weighted impurity from `0.50` to `0.28`.

In **Step 3, "Stop at max_depth = 1 to generalise"**, capping depth at `max_depth = 1` ends growth here. The left leaf predicts class `A` and the right predicts class `B`, yielding a consistent `83%` on both training and validation splits.

## What goes wrong

By default (`max_depth=None`, `min_samples_leaf=1`), CART keeps splitting recursively until every leaf is completely pure (`Gini = 0.00`). In the **Unbounded `max_depth = None` overfits noise** branch, removing the depth cap causes the tree to chase isolated outliers.

In **Step 4, "Unbounded tree isolates left outlier"**, the left node (`5A, 1B`) splits again solely to carve off the single `1B` point into its own one-sample leaf.

In **Step 5, "Right branch also isolates its single outlier"**, the right node similarly splits off its lone `1A` outlier. Weighted Gini drops all the way to `0.00` and training accuracy reaches `100%`.

In **Step 6, "Pure leaves memorise noise and hurt validation"**, those razor-thin micro-rules fail on unseen examples, dragging validation accuracy down from `83%` to `67%`.

## In practice

Scikit-learn provides four direct controls to regularise `DecisionTreeClassifier`: `max_depth` (caps tree height), `min_samples_split` (minimum samples required to split an internal node), `min_samples_leaf` (prevents tiny outlier leaves), and `ccp_alpha` (minimal cost-complexity post-pruning):

```python
from sklearn.tree import DecisionTreeClassifier

clf = DecisionTreeClassifier(
    criterion="gini",
    max_depth=3,
    min_samples_leaf=4,
    random_state=42,
)
clf.fit(X_train, y_train)
```

In production tabular workloads, single decision trees are often combined into ensembles—such as Random Forests or Gradient Boosted Trees—to average out individual tree variance while retaining strong non-linear accuracy.

## Pitfalls

- **Leaving `max_depth=None` and `min_samples_leaf=1` on noisy tabular datasets.** Unconstrained trees reliably memorise training noise and exhibit high variance across small changes in the training sample.
- **Expecting greedy splits to find the globally optimal tree.** CART chooses the best single split at each node without looking ahead, so a locally optimal root split can miss a better multi-step partition.
- **Ignoring class imbalance when interpreting raw Gini purity.** If 98% of records belong to class `A`, even an unsplit root has low Gini impurity; setting `class_weight="balanced"` or tuning decision thresholds helps prevent minority classes from being ignored.
- **Extrapolating beyond training ranges.** Decision trees predict piecewise-constant leaf values and cannot extrapolate trends outside the feature bounds seen during training.

## Further reading

- [scikit-learn User Guide — Decision Trees: Classification](https://scikit-learn.org/stable/modules/tree.html#classification)
- [scikit-learn API Reference — sklearn.tree.DecisionTreeClassifier](https://scikit-learn.org/stable/modules/generated/sklearn.tree.DecisionTreeClassifier.html)
