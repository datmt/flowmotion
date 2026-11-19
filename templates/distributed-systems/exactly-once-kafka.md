## Why it exists

By default, Apache Kafka delivers records at least once: if a broker commits a record and crashes before its acknowledgment reaches the producer, the producer's retry appends a duplicate, and multi-partition writes can leave partial results visible on failure. Kafka's **exactly-once semantics (EOS)** combine idempotent producers, atomic transactions, and `read_committed` consumers so retries across broker failovers never duplicate records or expose partial writes. Stream processors and financial or ledger pipelines running inside Kafka rely on EOS to keep derived topics and state stores exact across crashes and rebalances.

## How it works

Kafka builds EOS from three cooperating mechanisms: an **idempotent producer** (`enable.idempotence=true`), a **transactional producer** (`transactional.id`), and a **committed-only consumer** (`isolation.level=read_committed`).

In **Step 1, "Producer opens a transaction"**, the producer initializes with a stable `transactional.id`, receives Producer ID `PID=7` and a monotonic epoch from the Transaction Coordinator, and opens a transaction. Bumping the epoch fences off any older zombie producer sharing the same `transactional.id`.

In **Step 2, "Append seq1:m2 and replicate to follower"**, the producer attaches `(PID=7, seq=1)` to `m2` and writes to partition leader Broker 1, which replicates it to follower Broker 2. While the transaction is open, consumers configured with `read_committed` cannot observe `seq1:m2`.

In **Step 3, "Coordinator writes COMMIT marker"**, the producer finishes and asks the coordinator to commit. The coordinator appends a `COMMIT` control marker to every participating partition, atomically making `seq1:m2` visible to `read_committed` consumers.

## What goes wrong

Network drops and leader crashes break naive retries. In the **Broker failover deduplicates retried write** branch, **Step 3, "Broker 1 crashes before ACK reaches producer"** kills leader Broker 1 after `seq1:m2` has already replicated to Broker 2, leaving the producer unsure whether `m2` landed. Broker 2 becomes the new leader.

In **Step 4, "Producer retries seq=1; Broker 2 deduplicates"**, the producer resends `(PID=7, seq=1, m2)` to Broker 2. Because each partition tracks the latest sequence number per `PID`, Broker 2 recognizes that `seq=1` for `PID=7` is already in the log, skips appending a duplicate, and acknowledges `OK`. In **Step 5, "Transaction commits cleanly once"**, the coordinator commits the transaction and the `read_committed` consumer reads `m2` exactly once despite the failover and retry.

## In practice

Enabling `enable.idempotence=true` automatically configures `acks=all` and `retries=Integer.MAX_VALUE`; setting `transactional.id` enables idempotence implicitly. For read-process-write pipelines (such as Kafka Streams with `processing.guarantee=exactly_once_v2`), the producer includes input consumer offsets inside the same transaction using `sendOffsetsToTransaction` so output records, state-store changelogs, and offset commits succeed or abort together:

```properties
transactional.id=payments-processor-1
enable.idempotence=true
isolation.level=read_committed
enable.auto.commit=false
```

On the broker side, transactional durability relies on `replication.factor >= 3` and `min.insync.replicas >= 2` so committed records survive single-broker loss.

## Pitfalls

- **Leaving consumers on the default `read_uncommitted` isolation level.** Without `isolation.level=read_committed`, downstream consumers read uncommitted records and records from aborted transactions immediately, defeating transaction atomicity.
- **Assuming Kafka transactions cover external databases or REST APIs.** Kafka's transaction coordinator cannot run two-phase commit across external stores; writes to relational databases or third-party APIs still need idempotent sinks (such as upserts) or an outbox/Connect pattern.
- **Relying on idempotence alone across producer restarts or multiple partitions.** An idempotent producer without `transactional.id` deduplicates retries only within a single producer session and single partition—it neither fences zombie instances nor coordinates multi-partition atomicity.
- **Keeping `enable.auto.commit=true` in transactional consumers.** Auto-committing offsets outside `sendOffsetsToTransaction` breaks atomic read-process-write boundaries, reintroducing duplicates or skipped records on crash.

## Further reading

- [Message Delivery Semantics — Apache Kafka Documentation](https://kafka.apache.org/documentation/#semantics)
