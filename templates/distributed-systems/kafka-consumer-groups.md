## Why it exists

A single consumer process quickly becomes a throughput bottleneck on a high-volume stream, yet letting multiple processes read the same log arbitrarily breaks per-key ordering and duplicates work. Apache Kafka's **consumer groups** divide a topic's partitions across cooperating consumer instances so each partition is owned by at most one consumer in the group at a time. Event-driven services and stream processors use consumer groups to scale consumption horizontally while preserving strict ordering within every partition and automatically recovering when an instance crashes.

## How it works

Partitions are Kafka's unit of parallelism. In **Step 1, "Parallel consumption with per-partition order"**, the 3 partitions of `orders` map one-to-one to Consumers 1, 2, and 3 in Consumer Group A (`P0 -> C1`, `P1 -> C2`, `P2 -> C3`). Each consumer processes its partition's records sequentially in log order while all three run concurrently.

In **Step 2, "Consumers commit processed offsets"**, each consumer periodically commits its progress to Kafka's internal `__consumer_offsets` topic. (In Kafka's client API, the committed offset stores the next offset to fetch—`last_processed + 1`—so after processing offset `32`, a replacement consumer resumes cleanly at `33`.) Multiple independent consumer groups can subscribe to the same topic simultaneously, each maintaining its own committed offsets.

## What goes wrong

When a consumer instance crashes, deploys, or stalls, its partitions stall until ownership transfers. In the **Consumer crash triggers group rebalance** branch, **Step 3, "Consumer 3 crashes and misses heartbeats"** stops Consumer 3 while it is processing offset `33`. Consumers send periodic background heartbeats to the Group Coordinator; once silence exceeds `session.timeout.ms`, the coordinator declares Consumer 3 dead and triggers a **rebalance**.

In **Step 4, "Coordinator reassigns Partition 2 to Consumer 1"**, the surviving group members enter a new generation and the partition assignor hands Partition 2 to Consumer 1. Under incremental cooperative rebalancing, Consumer 1 and Consumer 2 keep processing P0 and P1 instead of pausing the entire group.

In **Step 5, "Consumer 1 resumes P2 from offset 32"**, Consumer 1 loads Partition 2's last committed position and continues from offset `33`. Any records Consumer 3 read after its last commit before crashing are reprocessed by Consumer 1 (at-least-once delivery).

## In practice

Consumer group stability hinges on choosing the right rebalance strategy and liveness timeouts:

```properties
group.id=orders-processors
partition.assignment.strategy=org.apache.kafka.clients.consumer.CooperativeStickyAssignor
session.timeout.ms=45000
heartbeat.interval.ms=15000
max.poll.interval.ms=300000
```

- **`CooperativeStickyAssignor`**: Uses incremental cooperative rebalancing to keep existing partition assignments sticky and avoid the stop-the-world pauses of classic eager rebalancing during rolling deployments or scaling. (Apache Kafka 4.0's KIP-848 further moves rebalance coordination to the broker side.)
- **`session.timeout.ms` and `heartbeat.interval.ms`**: Commonly set around 45 seconds and roughly one-third of `session.timeout.ms`, respectively, so transient network blips do not evict healthy consumers.
- **`max.poll.interval.ms`**: Caps the delay between `poll()` calls (default 5 minutes); if slow batch processing exceeds it, the consumer voluntarily leaves the group and triggers a rebalance.

## Pitfalls

- **Adding more consumers than partitions.** Because each partition can be assigned to at most one consumer in a group, extra consumer instances sit completely idle until the topic's partition count increases.
- **Triggering rebalance storms with slow processing loops.** Heavy database calls, external HTTP requests, or long GC pauses that exceed `max.poll.interval.ms` eject the consumer repeatedly; lower `max.poll.records` or raise `max.poll.interval.ms` to fit worst-case batch times.
- **Using classic eager rebalancing on large groups.** Revoking every partition on every rolling restart causes full-group stop-the-world pauses; switch to `CooperativeStickyAssignor`.
- **Assuming rebalance avoids duplicate processing.** After a crash before offset commit, the new owner replays uncommitted offsets, so downstream handlers must still be idempotent or transactional.

## Further reading

- [Consumers and Consumer Groups — Apache Kafka Documentation](https://kafka.apache.org/documentation/#intro_consumers)
