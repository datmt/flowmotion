## Why it exists

When a popular cache key expires under heavy traffic, hundreds of concurrent requests miss at once and execute the same expensive database query simultaneously, driving the origin into congestion collapse. Preventing this **cache stampede** (also called dog-piling or a cache miss storm) requires coordinating concurrent misses so only one request recomputes the value while the rest wait or read a refreshed copy. Any high-traffic service using cache-aside with expensive queries faces this failure whenever a hot TTL hits zero.

## How it works

The flow starts at **Step 1, "Hot key TTL expires"**, where the `home` key expires in Redis just as traffic peaks. In the **Request coalescing (singleflight) shields DB** branch, the application server tracks in-flight fetches by key rather than letting every miss proceed independently.

In **Step 2, "Singleflight lets only the first miss fetch"**, Clients 1, 2, and 3 all miss Redis, but only Client 1's request acquires the in-flight slot and runs `SELECT home` against Primary DB; Clients 2 and 3 attach to that same pending execution and wait. In **Step 3, "One DB query fills cache and answers all 3"**, Primary DB computes the payload once, the app writes it back to Redis with a fresh TTL, and all three waiting clients receive the shared response at the same time.

Locking or coalescing is one of three standard defenses against stampedes. The other two are **external recomputation**, where background workers refresh hot keys ahead of expiry, and **probabilistic early expiration**, where requests occasionally refresh an entry before its hard TTL expires.

## What goes wrong

In the uncoordinated **Thundering herd hits the database** scenario, **Step 2, "Concurrent requests all miss cache"** shows all three callers reading `MISS` from Redis within the same millisecond. Without coalescing or a per-key lock, **Step 3, "All misses stampede Primary DB"** fires all three identical queries into Primary DB concurrently.

At production scale, a single expired key can fan out into thousands of identical queries. As the database saturates, query latency climbs, which widens the window during which the cache stays empty—causing even more incoming requests to miss and pile onto the database in a cascading failure.

## In practice

In Go services, `golang.org/x/sync/singleflight` implements in-process duplicate suppression around a `Group` keyed by cache key:

```go
v, err, _ := group.Do("home", func() (any, error) {
    val, err := db.QueryHome()
    if err == nil {
        cache.Set("home", val, 60*time.Second)
    }
    return val, err
})
```

`Do` blocks duplicate callers and returns `(v, err, shared)`, `DoChan` delivers the same `Result` asynchronously over a channel, and `Forget(key)` detaches an in-flight key so future callers start a fresh attempt.

When locking across distributed servers is undesirable, **probabilistic early expiration** via the **XFetch** algorithm (Vattani, Chierichetti, and Lowenstein, 2015) triggers a refresh when `now - delta * beta * ln(rand()) >= expiry`, where `delta` is the previous recomputation duration and `beta` (default `1.0`) tunes aggressiveness—higher `beta` refreshes earlier, while lower `beta` favors hit rate.

## Pitfalls

- **Assuming in-process singleflight coordinates an entire fleet.** A local `singleflight.Group` collapses misses only inside one server process; with many app instances, each instance still sends one concurrent miss unless paired with a distributed lock or early expiration.
- **Propagating one caller's error or timeout to everyone.** Because all coalesced callers share the leader's return value and error, a transient failure or canceled context on the first request fails every waiter unless errors are isolated or keys are forgotten with `Forget`.
- **Overusing external background refresh.** Scheduled workers keep hot keys warm without user-facing misses, but they waste compute continuously recomputing keys that callers no longer request.
- **Letting lock waiters pile up indefinitely.** When using distributed locks, non-winners should either serve a stale cached value if available, wait with a bounded timeout, or return a temporary error rather than blocking threads unboundedly.

## Further reading

- [Cache stampede — Wikipedia](https://en.wikipedia.org/wiki/Cache_stampede)
- [Package singleflight — Go sync package documentation](https://pkg.go.dev/golang.org/x/sync/singleflight)
