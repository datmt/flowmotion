## Why it exists

A fixed-window rate limiter resets its counter at every minute or second boundary, letting a client fire the full quota right before the boundary and fire it again immediately after—doubling the allowed request rate. Storing an exact timestamp for every request (a sliding-window log) eliminates boundary bursts but consumes `O(limit)` memory per client, which breaks down across millions of domains and keys. The **sliding-window counter** algorithm, popularized by Cloudflare (2017), blends just two integer counters—the previous window and current window—to smooth boundaries in `O(1)` memory.

## How it works

For each key and period (here `limit = 4/min`), the store tracks only two counters: `prev` (the completed prior minute) and `curr` (the active minute).

In **Step 1, "Request arrives at 01:15 (25% into window)"**, the limiter reads `prev = 2` and `curr = 1`. Because 25% of the current minute has elapsed, a rolling 60-second window ending now overlaps 75% of the previous minute (`(period - elapsed) / period`).

In **Step 2, "Compute weighted count"**, the limiter estimates the rolling count assuming requests in the previous window were spread evenly: `prev * 0.75 + curr = 2 * 0.75 + 1 = 2.5`. Because `2.5` is under the limit of `4`, the request passes.

In **Step 3, "Increment current counter and forward"**, the limiter increments `curr` to `2` (raising the weighted estimate to `3.5`) and forwards `GET /api` to the backend.

## What goes wrong

The **Boundary burst blocked across minute edge** branch demonstrates why naive fixed windows fail and how the rolling weight closes the loophole. In **Step 2, "Client sends 4 requests at 00:59"**, a client exhausts its entire 4-request quota just before the minute rolls over (`prev = 4`, `curr = 0`). A fixed-window limiter would reset to `0` at `01:00` and let 4 more requests through immediately.

In **Step 3, "More requests arrive at 01:01"**, another burst arrives 2 seconds later. Because roughly 98% of the previous minute still falls inside the rolling 60-second window, the weighted count is `4 * 0.98 + 0 = 3.92`, and adding the incoming request brings it to `4.92 > 4`. In **Step 4, "Reject with 429 to stop double-rate burst"**, the limiter returns `429 Too Many Requests`, protecting the backend from the 2x boundary spike.

## In practice

```text
rate = prev_count * ((period - elapsed_in_curr) / period) + curr_count
if rate + 1 > limit:
  return 429
increment(curr_count)
```

To verify that approximating the previous window as uniformly distributed was accurate enough at global edge scale, Cloudflare tested the sliding-window counter across **400 million real requests from 270,000 distinct sources**:

- Only **0.003%** of requests were misclassified (wrongly allowed or rate-limited).
- Average deviation from an exact sliding-window log was about **6%**.
- **Zero** sources were falsely blocked while under their limit, and the 3 sources that slipped slightly over exceeded their threshold by less than 15%.

Cloudflare runs these two-integer counters asynchronously in distributed in-memory caches at the edge so rate-limit checks do not add synchronous bottleneck latency to normal user traffic.

## Pitfalls

- **Assuming the weighted count is exact.** The formula assumes traffic in the previous window arrived uniformly; sharp bursts inside the previous window can produce small (~6%) estimation errors, so use a sliding-window log if strict per-request exactness is mandatory.
- **Using non-atomic read-then-increment across distributed nodes.** Reading `prev` and `curr`, checking the limit, and incrementing `curr` in separate round trips lets concurrent requests race past the quota; combine check-and-increment atomically (or accept bounded slack with asynchronous edge counters).
- **Forgetting TTL expiration on window keys.** Creating a new key per `(client, minute)` without a TTL of at least two window periods leaks memory rapidly under high cardinality.
- **Ignoring clock skew across limiter nodes.** If edge servers disagree on the current minute boundary, different nodes increment different window buckets and weaken enforcement.

## Further reading

- [How we built rate limiting capable of scaling to millions of domains — Cloudflare Blog (June 2017)](https://blog.cloudflare.com/counting-things-a-lot-of-different-things/)
