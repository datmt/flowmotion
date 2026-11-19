## Why it exists

Giving a cluster node an indefinite lock or leadership role leaves the system stuck if that node crashes, disconnects, or freezes—yet contacting a consensus quorum on every single read adds a full network round trip to latency. A **time-bound lease** grants exclusive leadership for a limited time-to-live (TTL) that automatically expires unless renewed by periodic heartbeats. Control planes and leader-based databases use leases both to hand off leadership automatically after crashes and to serve fast local reads while the lease holds.

## How it works

To prevent split ownership during normal operation, the lease lives in a fault-tolerant **Consistent Core** (a consensus-backed store). In **Step 1, "L1 acquires a 10s lease"**, Leader L1 writes a lease with a 10-second TTL to the Lease Store, which promises not to grant leadership to any other node until `t=10`.

In **Step 2, "Serve reads locally without quorum"**, Leader L1 checks its local clock at `t=5`, sees 5 seconds remaining on its exclusive contract, and answers `GET x` directly from local state with zero extra quorum hops.

In **Step 3, "Renew before expiry"**, L1 sends a heartbeat renewal (`Renew(10s)`) well before `t=10`, extending its expiry to `t=20`. Steady renewals keep leadership stable without triggering elections, while a crashed leader naturally stops renewing so another node can take over once the TTL elapses.

## What goes wrong

Because leases rely on time passing consistently across separate machines, clock skew and process pauses can break exclusivity. In the **Clock skew creates two leaders** branch, **Step 3, "L1's clock lags; store expires lease"** leaves L1 believing the time is `t=9` (due to clock drift, an NTP wall-clock step, or a GC pause) while the Lease Store reaches `t=11` and expires L1's lease.

In **Step 4, "L2 acquires the new lease"**, Node L2 requests the lease at `t=11`, receives exclusive ownership through `t=21`, and commits `SET x=2`.

In **Step 5, "L1 serves stale state as a zombie leader"**, L1 still thinks `t=9 < 10`, so it answers a client's `GET x` with stale `x=1`—and if it writes to shared resources, it can collide with L2. Even switching from wall-clock timestamps to local **monotonic clocks** (`System.nanoTime()` in Java or monotonic timers in Go and Rust) only eliminates NTP jumps; separate machines' monotonic clocks still drift at slightly different rates, and process pauses can still stall a leader past expiry.

## In practice

Production control planes back time-bound leases with a Raft-based Consistent Core:

- **etcd** provides native `LeaseID` objects with TTLs; clients attach keys to a lease and maintain it through a background keep-alive heartbeat loop.
- **Kubernetes** runs leader election for components such as `kube-scheduler` and `kube-controller-manager` on top of `Lease` objects stored in etcd via the API server. The current holder periodically updates `renewTime`; if it misses renewals past `--lease-duration`, another replica takes over.

```text
keep_alive(lease_id, ttl):
  every ttl / 3:
    if not store.renew(lease_id):
      step_down_immediately()
```

Operators leave a wide safety margin between the renewal interval and the TTL to absorb network jitter and clock drift, and pair leases with monotonic **fencing tokens** (generation numbers or terms) checked by downstream storage whenever write correctness cannot depend on timing bounds.

## Pitfalls

- **Measuring lease expiry with wall-clock time.** Comparing absolute wall-clock timestamps across hosts fails whenever NTP steps a clock forward or backward; measure elapsed duration with monotonic clocks locally and still budget for cross-host drift.
- **Setting the renewal interval too close to the TTL.** Renewing right before expiry leaves no headroom for GC pauses or packet delays, causing unnecessary leadership churn.
- **Relying on leases alone for write correctness.** Clock drift or a stop-the-world pause can leave a zombie leader running past expiry; attach monotonic fencing tokens checked by the storage layer to block stale writes.
- **Using a non-replicated store for the lease.** Backing leases with a single node creates a single point of failure; Unmesh Joshi's pattern requires a Consistent Core so lease state survives node crashes.

## Further reading

- [Time-Bound Lease — Unmesh Joshi (Patterns of Distributed Systems, martinfowler.com)](https://martinfowler.com/articles/patterns-of-distributed-systems/time-bound-lease.html)
