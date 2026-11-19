## Why it exists

When a user request fans out across many backend servers in parallel, the response is only as fast as the slowest replica—so rare single-node hiccups from garbage collection, background compactions, or queueing dominate end-to-end latency. As Jeffrey Dean and Luiz André Barroso showed in The Tail at Scale (2013), if a single server has a 1% chance of taking 1 second, a request fanning out across 100 servers has a `1 - 0.99^100` (63%) chance of hitting at least one 1-second stall. **Hedged requests** issue a backup copy to another replica after a short delay so isolated tail stalls no longer delay the user.

## How it works

To cut tail latency without doubling normal traffic, the caller defers sending the backup request until the primary call exceeds a short threshold—typically the expected 95th-percentile latency.

In **Step 1, "Send primary request to Replica 1"**, Frontend dispatches the idempotent `GET /profile` request to Replica 1 and starts a 10ms timer. Because Replica 1 hits a 120ms stop-the-world GC pause, no reply arrives before the timer fires.

In **Step 2, "Timer fires at 10ms: hedge to Replica 2"**, Frontend sends a duplicate hedged request to Replica 2. Because isolated latency spikes on independent replicas rarely coincide, Replica 2 handles the copy cleanly. In **Step 3, "Replica 2 responds fast; cancel Replica 1"**, Replica 2 returns `200 OK` in 3ms; Frontend returns to the client in 13ms total instead of 120ms and cancels the slow in-flight call on Replica 1.

A related technique from the same paper, **tied requests**, sends copies to multiple replicas with cross-cancellation: as soon as one replica begins executing the request, it signals the other replicas to cancel their queued copies before they burn work.

## What goes wrong

Hedging assumes slowdowns are isolated to a small fraction of replicas. In the **Global overload turns hedging into 2x load** branch, **Step 2, "Both replicas are saturated"** shows a fleet-wide traffic spike pushing every replica past the 10ms threshold. Now almost every incoming request fires a backup copy, doubling cluster load precisely when the fleet is already struggling and accelerating a cascading outage.

In **Step 3, "Cap hedging with a token budget"**, the caller enforces a client-side hedging budget so backup requests stop firing automatically once fleet-wide latency or error rates climb.

## In practice

In the Google Bigtable benchmark reported by Dean and Barroso—reading 1,000 keys distributed across 100 servers—sending a hedged read after a 10ms delay cut 99.9th-percentile latency from **1,800ms to 74ms** while adding only **2%** more requests.

gRPC builds hedging and throttling directly into its Service Config via per-method `hedgingPolicy` and per-server `retryThrottling`:

```json
{
  "hedgingPolicy": {
    "maxAttempts": 2,
    "hedgingDelay": "0.01s",
    "nonFatalStatusCodes": ["UNAVAILABLE"]
  },
  "retryThrottling": {
    "maxTokens": 10,
    "tokenRatio": 0.1
  }
}
```

In gRPC's throttling bucket, `token_count` starts at `maxTokens`, decrements by `1` on retryable failures, increments by `tokenRatio` on successes, and pauses hedging and retries whenever `token_count` drops below `maxTokens / 2`.

## Pitfalls

- **Hedging non-idempotent mutations.** Sending duplicate write requests (such as charging a card or creating an order) without idempotency guarantees can execute side effects twice.
- **Omitting a client-side hedging budget.** Without token-bucket throttling, fleet-wide saturation turns hedging into a self-inflicted 2x traffic multiplier.
- **Setting `hedgingDelay` too aggressively.** Sending backups well below p95—or at `0s` without tied cross-cancellation—wastes replica CPU and network capacity on requests that were about to succeed.
- **Forgetting to cancel losing attempts.** Leaving slow primary requests running after a hedge wins wastes server threads and prolongs congestion on the struggling replica.

## Further reading

- [The Tail at Scale — Jeffrey Dean and Luiz André Barroso (Google Research / CACM 2013)](https://research.google/pubs/the-tail-at-scale/)
- [gRPC Retry and Hedging Service Config Specification](https://grpc.io/docs/guides/retry/)
