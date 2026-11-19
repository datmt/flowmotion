## Why it exists

A single application server cannot absorb growing traffic or survive hardware failures alone, yet putting multiple servers behind one endpoint still fails if traffic distributes unevenly or keeps hitting a struggling host. **Load balancing algorithms** choose which backend handles each request—trading simplicity, cache locality, and adaptability to varying request costs. Reverse proxies, API gateways, and service meshes rely on them to spread traffic across backend pools while keeping latency predictable as servers slow down or fail.

## How it works

The flow starts with two static routing strategies. In **Step 1, "Round-robin rotates evenly"**, the Load Balancer assigns incoming requests sequentially to Backend 1, Backend 2, and Backend 3 (`conns = 1, 1, 1`). Round-robin is NGINX's default because it requires almost no state and splits traffic equally whenever backends have identical capacity and uniform request costs; adding server `weight` values lets larger machines take a proportionally larger share.

In **Step 2, "IP/key hash pins a client to one backend"**, hashing a client IP (`ip_hash`) or application key (`user-7`) maps every request for that key deterministically to Backend 2. Sticky hashing preserves session affinity and keeps per-backend local caches warm, and adding consistent hashing (`hash $key consistent`) minimizes remapping when servers join or leave.

## What goes wrong

Static rotation breaks down when request durations vary or one host degrades. In the **Slow backend: round-robin vs least-connections** branch, **Step 2, "Backend 2 stalls on heavy work"** slows Backend 2 with garbage collection or disk contention until 8 active connections pile up there while Backends 1 and 3 hold only 1 each.

In **Step 3, "Naive round-robin keeps feeding B2"**, round-robin ignores live load and sends `req 4` straight into overloaded Backend 2 (`9` active connections), worsening queue backlog and tail latency.

In **Step 4, "Least-connections routes around slow B2"**, switching to **least-connections** (`least_conn`) compares live active connection counts (`B1=1, B2=9, B3=1`) and routes `req 5` and `req 6` to Backends 1 and 3 instead. Because slow hosts accumulate open connections naturally, least-connections automatically shifts traffic away from them until they drain and recover.

## In practice

NGINX exposes these algorithms directly inside an `upstream` block, along with `random two least_conn` (the **Power of Two Choices** algorithm, which picks two random backends and chooses the less busy one to avoid full-pool scans and herd effects in large clusters):

```nginx
upstream backend {
    random two least_conn;
    server b1.internal max_fails=3 fail_timeout=30s;
    server b2.internal max_fails=3 fail_timeout=30s;
    server b3.internal max_fails=3 fail_timeout=30s;
}
```

Routing algorithms work alongside **health checks**: passive checks (in NGINX Open Source via `max_fails` and `fail_timeout`) temporarily eject backends after repeated connection errors or timeouts, while active checks (such as NGINX Plus `health_check uri=/health interval=5s fails=3 passes=2`) probe backends independently before routing user traffic to them.

## Pitfalls

- **Using round-robin for heterogeneous request durations.** Long-running queries or WebSocket connections stay open far longer than quick reads, silently overloading whichever backend happens to draw the expensive requests.
- **Relying on `ip_hash` behind corporate NATs or proxies.** Thousands of users sharing one egress IP hash to the same backend, creating hot spots; hash on an application-level key or move session state to a shared store instead.
- **Confusing least-connections with error health checks.** A broken backend that immediately returns `500` errors finishes connections in milliseconds—looking "fastest" with zero active connections and attracting **more** traffic under `least_conn` unless health checks eject it.
- **Forgetting server weights on mixed hardware.** Equal rotation across servers with different CPU or memory capacities saturates smaller instances first.

## Further reading

- [What Is Load Balancing? — NGINX Glossary](https://www.nginx.com/resources/glossary/load-balancing/)
- [HTTP Load Balancing — NGINX Documentation](https://nginx.org/en/docs/http/load_balancing.html)
