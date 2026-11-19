## Why it exists

Enforcing a rigid per-second cap rejects legitimate clients whose traffic arrives in brief natural spikes, while leaving APIs unthrottled lets noisy tenants or retry storms exhaust backend capacity. A **token bucket** rate limiter bounds long-term average throughput at a steady refill rate `r` while permitting short bursts up to a fixed bucket capacity `B`. API gateways, network routers, and cloud block-storage systems use token buckets whenever workloads need burst headroom without sacrificing sustained-rate protection.

## How it works

A bucket holds up to `B` tokens (`cap=3` in the animation) and refills at constant rate `r` (`1/s`), discarding any excess once full. Each request must spend a token (or multiple tokens for heavier requests) before proceeding.

In **Step 1, "Request consumes one token"**, `GET /orders` arrives while 3 tokens are available; the limiter removes one token (leaving 2) and forwards the request to the Backend API.

In **Step 2, "Timer refills up to capacity"**, one second later a new token arrives, restoring the bucket to `3` and capping further accumulation. As long as a client's sustained arrival rate stays at or below `r`, the bucket never empties and requests pass with zero queuing delay.

## What goes wrong

In the **Burst drains bucket, then throttles** branch, **Step 2, "Short burst spends remaining tokens"** receives two back-to-back requests right after **Step 1**. Because the bucket still holds 2 tokens, it absorbs the burst immediately—unlike a leaky-bucket queue that smooths every packet to a strictly fixed drip—leaving 0 tokens.

In **Step 3, "Next request rejected with 429"**, a fourth request arrives before the next refill tick. With the bucket empty, this **traffic policing** limiter fast-fails immediately with `429 Retry-After: 1s` instead of queuing work or overloading the backend. (In **traffic shaping** deployments, non-conformant packets are queued until tokens replenish instead of dropped.)

In **Step 4, "Next tick restores one token"**, the next second adds a single token, letting one request pass while keeping sustained throughput pinned to `1/s`.

## In practice

Production limiters avoid per-key background timers by storing just two values—current token balance and last refill timestamp—and refilling lazily on each request:

```text
allow(bucket, cost=1, now):
  elapsed = now - bucket.last_refill
  bucket.tokens = min(bucket.cap, bucket.tokens + elapsed * bucket.rate)
  bucket.last_refill = now
  if bucket.tokens < cost:
    return false
  bucket.tokens -= cost
  return true
```

Token buckets appear across both networking and cloud infrastructure:

- **Linux Traffic Control (`tc`):** `tbf` (Token Bucket Filter) shapes interface bandwidth with configurable rate and burst parameters, while `htb` (Hierarchical Token Bucket) lets child traffic classes borrow unused tokens from parent classes.
- **Envoy Proxy:** Its Local Rate Limiter filter uses a per-worker token bucket with configurable fill interval, maximum tokens, and per-request token cost; global rate limiting pairs Envoy with a shared Redis-backed store.
- **AWS:** Amazon API Gateway uses token buckets to cap request rates and bursts per account/stage, and Amazon EBS/EC2 burst-performance tiers accumulate I/O credits when idle for short bursts.

## Pitfalls

- **Setting bucket capacity `B` too large for downstream pools.** If `B` exceeds what the backend can absorb instantaneously, an idle client returning with a full bucket can still trigger a sharp downstream spike.
- **Using wall-clock time instead of monotonic clocks for lazy refill.** An NTP step backward makes `elapsed` negative (shrinking or stalling refills), while a step forward refills the bucket prematurely.
- **Choosing token bucket when strictly smooth output is required.** Token buckets permit instantaneous bursts up to `B`; if downstream hardware requires evenly spaced output, use traffic shaping or a leaky-bucket queue.
- **Running independent per-instance buckets without accounting for fleet size.** Across `M` gateway replicas without shared state, a client's effective burst and refill limits multiply by up to `M`.

## Further reading

- [Token bucket — Wikipedia](https://en.wikipedia.org/wiki/Token_bucket)
