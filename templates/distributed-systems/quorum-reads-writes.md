## Why it exists

Waiting for every replica to acknowledge every write hurts availability and exposes every operation to the slowest node in the cluster, yet writing to only one replica risks data loss and stale reads. **Quorum reads and writes**—parametrized by replica count `N`, read quorum `R`, and write quorum `W` in systems like Amazon Dynamo (2007)—let teams tune consistency, latency, and availability by choosing `R + W > N` so read and write sets are guaranteed to overlap. Leaderless key-value stores use this mechanism to stay available through single-node slowdowns or crashes without a single master bottleneck.

## How it works

Each key is replicated across `N` storage nodes (`N=3` in the animation), and a coordinator forwards reads and writes to the top `N` healthy nodes in the key's preference list.

In **Step 1, "Write succeeds after W=2 replicas ack"**, the client sends `PUT v2@2`. The coordinator writes locally and sends the update to all replicas, waiting only for `W=2` acknowledgements (R1 and R2). Even though R3 is slow, the coordinator returns `OK (W=2)` immediately without blocking on the third replica.

In **Step 2, "Read queries R=2 replicas (R2 and R3)"**, a subsequent reader asks for `R=2` responses. Because `R + W = 4 > 3`, any subset of 2 replicas must intersect the 2-replica write quorum in at least one node—here R2 returns `v2@2` while lagging R3 still returns `v1@1`.

In **Step 3, "Higher version wins: return v2@2"**, the coordinator compares version metadata (`2 > 1`), returns the latest value `v2@2` to the client, and can repair stale R3 in the background. When concurrent writes produce causally unrelated versions (tracked via vector clocks in Dynamo), the coordinator returns all divergent versions to the application for semantic reconciliation—such as merging shopping cart items—before writing the reconciled result back.

## What goes wrong

Lowering `R` or `W` until `R + W <= N` removes the guaranteed overlap between read and write quorums. In the **Stale read when R + W <= N (W=2, R=1)** branch, **Step 2, "Read asks only R=1 replica (R3)"** cuts read latency by setting `R=1`, giving `R + W = 3 <= 3`.

In **Step 3, "Client receives stale v1@1"**, the read lands on R3—the single replica that missed `v2@2`—and returns stale `v1@1`. Even with `R + W > N`, Dynamo's sloppy quorum (hinted handoff) can still produce temporary staleness during node outages because writes temporarily land on standby nodes outside the primary `N` replicas.

## In practice

Because the latency of a `get` or `put` is dictated by the slowest of the `R` or `W` participating replicas, production Dynamo services set `R` and `W` smaller than `N`:

```text
Typical Dynamo configuration:
  N = 3   (replicas across multiple data centers)
  R = 2   (read quorum)
  W = 2   (write quorum; R + W = 4 > 3)
```

In Dynamo's SOSP 2007 evaluation, `(N=3, R=2, W=2)` was the common configuration balancing durability, availability, and latency SLAs across multi-datacenter deployments. Raising `W` narrows the durability vulnerability window at the cost of lower write availability (requiring more hosts to be reachable), while lowering `W` to `1` maximizes write availability at higher durability risk.

## Pitfalls

- **Assuming `R + W > N` gives linearizability.** Overlapping quorums detect fresher versions during clean failures, yet concurrent overlapping writes, sloppy quorums (hinted handoff), or partial writes that fail after updating one replica can still expose non-linearizable reads.
- **Setting `R = N` or `W = N` unnecessarily.** Waiting for all `N` replicas makes a single slow or failed server stall or fail every operation.
- **Using wall-clock timestamps instead of version vectors to pick winners.** Comparing unsynchronized physical clocks can silently drop newer writes; Dynamo uses vector clocks to distinguish causal descendants from concurrent conflicts.
- **Ignoring multi-datacenter latency when choosing `R` and `W`.** Spreading `N` replicas across datacenters protects against site outages, so `R` and `W` directly determine whether operations must wait on cross-datacenter round trips.

## Further reading

- [Dynamo: Amazon's Highly Available Key-value Store — DeCandia et al. (SOSP 2007)](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf)
