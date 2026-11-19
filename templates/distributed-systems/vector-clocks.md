## Why it exists

Physical wall clocks drift across machines, and scalar Lamport clocks cannot tell whether two events are causally related or truly concurrent because `L(a) < L(b)` does not imply `a` caused `b`. **Vector clocks**—independently introduced by Colin Fidge and Friedemann Mattern in 1988—replace a single counter with an array of logical counters, one per participating process. Comparing two vectors determines the exact **partial order** of events across an asynchronous cluster, letting replicated stores tell whether one update safely overwrites another or whether two concurrent writes must be reconciled as a conflict.

## How it works

Each node holds a vector `[A, B, C]` initialized to `[0, 0, 0]`. Whenever a node performs a local event or sends a message, it increments its own slot; whenever it receives a message carrying a sender's vector, it takes the element-wise maximum of both vectors and increments its own slot.

In **Step 1, "Node A writes x=1"**, Node A records `x=1` and increments slot A from `0` to `1`, tagging the write with `[1,0,0]`.

In **Step 2, "Node A replicates x=1 to Node B"**, Node A sends `x=1 [1,0,0]` to Node B. Node B computes `max([0,0,0], [1,0,0]) = [1,0,0]` and increments slot B to `[1,1,0]`, capturing that Node B has now observed Node A's write.

In **Step 3, "Node B updates x=2"**, Node B writes `x=2` and increments its slot to `[1,2,0]`, then replicates `x=2 [1,2,0]` to Node C (which advances to `[1,2,1]`). Comparing `[1,0,0]` against `[1,2,0]`, every coordinate in `[1,0,0]` is less than or equal to the corresponding coordinate in `[1,2,0]` and slot B is strictly smaller (`0 < 2`). That strict dominance (`[1,0,0] < [1,2,0]`) proves `x=2` **causally descends** from `x=1`, so Node C can overwrite `x=1` without data loss.

## What goes wrong

When replicas accept writes independently without coordinating first—such as during a network partition—neither write has seen the other. In the **Concurrent writes detected as conflict** branch, **Step 2, "Node B writes x=9 without seeing A"** occurs before Node A's replication arrives: Node B increments its own slot from `[0,0,0]` to `[0,1,0]`.

In **Step 3, "Node C receives both versions"**, both `x=1 [1,0,0]` and `x=9 [0,1,0]` arrive at Node C.

In **Step 4, "Neither vector dominates: true conflict"**, slot-by-slot comparison finds `1 > 0` in slot A yet `0 < 1` in slot B. Neither vector is less than or equal to the other (`[1,0,0] || [0,1,0]`), proving the two updates are **concurrent**. Instead of silently dropping one write via last-write-wins wall timestamps, Node C preserves both **siblings** so the application can merge them.

## In practice

Leaderless key-value stores modeled on **Amazon Dynamo**—including **Riak**—attach compact **version vectors** (a practical variant of vector clocks keyed per object and coordinator/actor) to stored values:

```text
Vector comparison rules (for vectors U and V of length N):
  U < V  (U causally precedes V) : U[i] <= V[i] for all i, and U[j] < V[j] for some j
  U || V (concurrent conflict)   : U[j] < V[j] for some j, and U[k] > V[k] for some k
```

When a read returns a single dominating vector, the store resolves the winner automatically; when concurrent siblings exist, the store returns all conflicting versions to the client (for example, merging items in an Amazon shopping cart) along with the merged context so the next write supersedes all siblings.

## Pitfalls

- **Tracking per-client entries in high-churn systems without pruning.** Vector size grows as `O(N)` with the number of distinct actors; keying entries by unbounded transient clients instead of a bounded set of storage nodes causes metadata bloat (Amazon Dynamo prunes old entries once a vector exceeds a threshold, trading a small false-reconciliation risk for bounded size).
- **Expecting vector clocks to resolve conflicts automatically.** Vector clocks **detect** concurrency; the application or a CRDT must still decide how to merge conflicting siblings.
- **Confusing Lamport clocks with vector clocks.** A scalar Lamport clock is `O(1)` in size and sufficient when you only need a consistent tie-breaking order, whereas vector clocks cost `O(N)` metadata specifically to distinguish causality from concurrency.
- **Forgetting to pass the read context back on the next write.** In Dynamo-style stores, writing without the previously read vector clock causes the client's own sequential update to appear concurrent with the version it just read, spawning spurious siblings.

## Further reading

- [Wikipedia — Vector clock](https://en.wikipedia.org/wiki/Vector_clock)
- [Dynamo: Amazon's Highly Available Key-value Store — DeCandia et al. (SOSP 2007)](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf)
