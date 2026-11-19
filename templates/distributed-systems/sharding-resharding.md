## Why it exists

A single database server eventually runs out of CPU, memory, or disk throughput as dataset size and write traffic grow, and scaling vertically hits hardware limits and high costs. **Sharding** (horizontal partitioning) splits a logical table by rows across independent **shared-nothing** servers—each with its own CPU, memory, and storage—so write throughput and index lookups scale out horizontally. Online **resharding** lets teams split a busy range onto new hardware without taking the database offline when traffic skew concentrates load on one shard.

## How it works

A **shard key** determines which shard owns each row, and a **Shard Router** maintains the routing table mapping key ranges (or hash buckets) to physical database instances.

In **Step 1, "Router maps each key to its owning shard"**, the logical keyspace is partitioned by key range: Shard 1 owns `[A-M]` and Shard 2 owns `[N-Z]`. When clients submit writes for `Alice` and `Zoe`, the router inspects each shard key and forwards `PUT Alice` to Shard 1 and `PUT Zoe` to Shard 2 in parallel. Because each shard stores a smaller subset of rows, its indexes (such as B-trees) stay smaller and faster, and a failure or traffic spike on one shard is isolated from others.

## What goes wrong

Range sharding preserves ordering for range scans, yet real workloads rarely distribute keys evenly across ranges. In the **Hot shard split online into two ranges** branch, **Step 2, "Shard 1 becomes a hot shard"** shows skewed writes concentrating in `[G-M]` (90% of writes), driving Shard 1 to 98% CPU while Shard 2 sits mostly idle.

Splitting a live shard without downtime requires moving data while writes keep arriving. In **Step 3, "Provision Shard 3 and backfill [G-M]"**, the cluster provisions Shard 3, copies existing `[G-M]` rows in the background, and tails ongoing mutations from Shard 1 so Shard 3 catches up without locking writes.

In **Step 4, "Atomically flip router map: S1=[A-F], S3=[G-M]"**, once Shard 3 is caught up, the cluster atomically updates the routing map so Shard 1 owns `[A-F]` and Shard 3 owns `[G-M]`. Subsequent writes route `Alice` to Shard 1 and `Maya` to Shard 3, spreading the hotspot across independent hardware.

## In practice

Production sharded databases automate or orchestrate this copy-stream-cutover pipeline with different default split units:

- **MongoDB** partitions collections into contiguous **chunks** (default **128 MB**), splitting chunks automatically when they exceed the limit; a background balancer migrates chunks via `moveChunk` (initial document copy plus oplog catch-up) and updates **Config Servers** atomically so `mongos` routers switch immediately.
- **CockroachDB** splits its global keyspace into **ranges** (default **512 MiB**) automatically by size or load/QPS, replicating ranges with Raft and shifting traffic via Raft leaseholder transfers.
- **Vitess** splits MySQL key ranges online using **VReplication** (consistent snapshot copy followed by MySQL binlog streaming) and flips traffic via `SwitchReads` and `SwitchWrites`:

```text
Online range split lifecycle:
  1. Snapshot copy   source[G-M] -> target S3
  2. Stream delta    tail binlog/oplog mutations until lag ~ 0
  3. Atomic cutover  flip routing metadata: S1=[A-F], S3=[G-M]
```

## Pitfalls

- **Choosing a monotonic shard key under range sharding.** Sharding by auto-incrementing IDs or current timestamps sends every new write to the highest range, creating a permanent hot shard on the newest server; hash sharding spreads writes evenly at the cost of scatter-gather range scans.
- **Expecting cross-shard `JOIN`s, foreign keys, and multi-shard transactions to stay cheap.** Operations that span multiple shards lose shared-nothing isolation and add network coordination overhead.
- **Changing modulo-hash shard counts without consistent hashing or virtual ranges.** Recomputing `hash(key) % N` when adding a shard reshuffles almost the entire dataset at once.
- **Cutting over before replication lag drains.** Flipping the routing table while Shard 3 still lags behind Shard 1's write stream causes missing or stale reads on the new owner.

## Further reading

- [Wikipedia — Shard (database architecture)](https://en.wikipedia.org/wiki/Shard_(database_architecture))
