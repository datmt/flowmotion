## Why it exists

When datasets arrive without labels, teams still need to group similar customers, documents, or sensor readings into compact segments. **K-Means** partitions `N` observations into `K` clusters by minimising **inertia**—the sum of squared Euclidean distances from each point to its cluster's centre (centroid). Because finding the globally optimal partition is NP-hard, **Lloyd's algorithm** solves it iteratively in fast alternating passes, making K-Means one of the quickest and most widely used clustering methods.

## How it works

Consider six 1D points `[0, 1, 10, 11, 20, 21]` with `K = 3`, which naturally form three tight pairs.

In **Step 1, "k-means++ spreads initial centroids"**, **k-means++** picks the first centroid at random and chooses each remaining centroid with probability proportional to its squared distance from the closest existing centroid. That spreads the seeds across all three groups (`c1 = 0.0`, `c2 = 10.0`, `c3 = 21.0`).

In **Step 2, "Assign each point to its nearest centroid"**, Lloyd's assignment step maps every sample to its closest centroid: `{0, 1} -> c1`, `{10, 11} -> c2`, and `{20, 21} -> c3`.

In **Step 3, "Recompute each centroid as cluster mean"**, each centroid shifts to the mean of its assigned points (`0.5`, `10.5`, `20.5`), achieving a total within-cluster sum of squares (inertia) of `1.5`.

In **Step 4, "No assignments change: converged!"**, repeating assignment produces no changes (zero centroid movement), so Lloyd's algorithm halts at the global optimum.

## What goes wrong

Because K-Means inertia is non-convex, Lloyd's algorithm is guaranteed only to converge to a **local minimum**, making it highly sensitive to initial centroid placement. In the **Bad random init traps in local minimum** branch, naive random seeding draws two centroids from the same cluster.

In **Step 5, "Random init places two seeds in one cluster"**, random selection picks `c1 = 0.0`, `c2 = 1.0`, and `c3 = 11.0`, leaving no seed near `{20, 21}`.

In **Step 6, "Right two clusters merge under c3"**, `0` goes to `c1`, `1` goes to `c2`, and all four points `{10, 11, 20, 21}` attach to `c3`.

In **Step 7, "Trapped in fixed-point local minimum"**, recomputing means yields `c1 = 0.0`, `c2 = 1.0`, and `c3 = 15.5` with inertia `101.0`—67 times worse than the optimum. Yet on the next assignment check, `10` is `5.5` away from `15.5` versus `9.0` away from `1.0`, so zero points switch clusters. Lloyd's algorithm declares convergence and exits permanently trapped in a split-and-merged partition.

## In practice

In `scikit-learn`, `KMeans` defaults to `algorithm="lloyd"` and uses greedy **`init="k-means++"`** (sampling multiple candidate centres at each seeding step to spread them out reliably). The `n_init` parameter runs clustering multiple times from different seeds and retains the solution with the lowest inertia (`n_init="auto"` runs once with `k-means++` and 10 times with `init="random"`):

```python
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.cluster import KMeans

model = make_pipeline(
    StandardScaler(),
    KMeans(n_clusters=3, init="k-means++", n_init=10, random_state=42),
)
labels = model.fit_predict(X)
```

Standardising features before K-Means is essential whenever columns have different units, because Euclidean distance is dominated by whichever feature has the largest numerical scale.

## Pitfalls

- **Using raw unscaled features with Euclidean distance.** A feature measured in thousands overwhelms a feature measured between `0` and `1`, effectively ignoring the smaller-scale column.
- **Relying on a single random seed (`init="random"`, `n_init=1`).** Poor starting centroids can lock Lloyd's algorithm into high-inertia local minima that never self-correct.
- **Applying K-Means to elongated, crescent-shaped, or uneven-density clusters.** K-Means assumes roughly spherical, equal-variance clusters around centroids; non-convex shapes are better served by DBSCAN or Gaussian Mixture Models.
- **Choosing `K` by minimising inertia alone.** Inertia always decreases as `K` increases (reaching `0` when `K = N`), so selecting `K` requires domain knowledge, an elbow check, or metrics such as silhouette score.

## Further reading

- [scikit-learn User Guide — K-means clustering](https://scikit-learn.org/stable/modules/clustering.html#k-means)
- [scikit-learn API Reference — sklearn.cluster.KMeans](https://scikit-learn.org/stable/modules/generated/sklearn.cluster.KMeans.html)
