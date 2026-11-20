## Why it exists

Machine learning models have two conflicting data access needs: training requires scanning months of historical records in batch, whereas real-time inference needs the latest feature values for a single user in milliseconds. Teams frequently solve this by building one pipeline in a data warehouse for data scientists and rewriting a second pipeline in an application database for production serving—a split that quietly introduces **training/serving skew**. A **feature store** (such as **Feast**) unifies feature definitions while splitting storage into an **offline store** and an **online store** so both worlds stay consistent.

## How it works

Feast's architecture keeps one declarative registry over dual storage backends—an analytical warehouse for history and a low-latency key-value store for live requests.

In **Step 1, "Declare feature view once"**, `user_7d_spend` is defined once in the feature registry so both batch extraction and live serving reference the same schema and lineage.

In **Step 2, "Point-in-time join builds leak-free training set"**, calling `get_historical_features` against the offline store (e.g., BigQuery, Snowflake, or Parquet) performs a **point-in-time join**: for every row in the training entity dataframe, Feast looks up the latest feature value whose timestamp is `<= event_timestamp`. That faithfully recreates what was known at prediction time without leaking future data.

In **Step 3, "Materialise latest values to online store"**, running `feast materialize` extracts only the latest state for each entity from the offline store and pushes it into the online key-value store (such as Redis or DynamoDB).

In **Step 4, "Sub-millisecond serving matches training exactly"**, the inference API calls `get_online_features` and receives `$142.50` in milliseconds—matching the exact semantics trained offline with zero skew.

## What goes wrong

When training and serving pipelines are authored independently, subtle semantic differences creep in immediately. In the **Separate pipelines cause training/serving skew** branch, the central feature registry is bypassed.

In **Step 5, "Two teams implement the same feature separately"**, data scientists compute `user_7d_spend` in Pandas over calendar UTC days (`$142.50`), while backend engineers reimplement it in production SQL over a rolling 168-hour window that excludes refunds (`$198.00`).

In **Step 6, "No exception fires — only silent feature drift"**, both implementations return valid floating-point numbers, so schema validators and health checks stay green despite a `+39%` discrepancy for the same user.

In **Step 7, "Production accuracy silently degrades"**, live model performance decays far below offline validation benchmarks, leaving engineers to audit two diverging codebases.

## In practice

In Feast, data scientists construct historical training sets with `get_historical_features()`, push current values via `feast materialize`, and serve live predictions with `get_online_features()`:

```python
from feast import FeatureStore

store = FeatureStore(repo_path="feature_repo/")

training_df = store.get_historical_features(
    entity_df=entity_df,
    features=["user_stats:user_7d_spend"],
).to_df()

online_vec = store.get_online_features(
    features=["user_stats:user_7d_spend"],
    entity_rows=[{"user_id": 1001}],
).to_dict()
```

Where historical warehouse tables receive late-arriving corrections or backfills, Feast also supports `filter_by_created_timestamp=True` during historical retrieval so training rows only include values that were actually available when each event occurred.

## Pitfalls

- **Joining offline training tables by entity ID without timestamp bounds.** A plain equality join pulls future feature values into historical rows, causing severe target leakage that invalidates offline metrics.
- **Letting online materialisation lag behind event freshness.** If `feast materialize` runs only nightly for a feature that changes minute by minute, live requests read stale values even though the feature definition is shared.
- **Re-implementing complex transforms in serving code instead of sharing definitions.** Any unshared null handling, timezone rounding, or window-boundary tweak reintroduces silent training/serving skew.
- **Skipping online feature logging.** Logging the exact feature vectors fed to the model at inference time lets you audit parity against offline replay and spot skew before business metrics drop.

## Further reading

- [Feast Documentation — Architecture](https://docs.feast.dev/getting-started/architecture)
- [Feast Documentation — Point-in-time joins](https://docs.feast.dev/getting-started/concepts/point-in-time-joins)
