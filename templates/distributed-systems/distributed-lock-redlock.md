## Why it exists

A distributed lock with a time-to-live (TTL) lease prevents a crashed client from locking out everyone else forever, yet the lease alone cannot stop a paused or delayed client from overwriting shared storage after its lease expires. Pairing a consensus-backed lock service with strictly monotonically increasing **fencing tokens** lets the storage layer detect and reject stale writers. Any service coordinating read-modify-write access to shared storage—such as files in HDFS or S3—needs fencing whenever mutual exclusion is required for data correctness rather than mere efficiency.

## How it works

In **Step 1, "Client 1 acquires lock (TTL=10s, token=33)"**, Client 1 obtains a 10-second lease and a fencing token `33` that increases strictly every time any client acquires the lock. Because the lock is a lease, another client can eventually take over if Client 1 crashes without releasing it.

In **Step 2, "Storage verifies token 33 and writes"**, Client 1 includes `tok=33` with its write request. Storage actively checks that `33` is at least as high as the highest token it has previously accepted (`max_seen = 0`), records `max_seen = 33`, and commits `x=A`.

## What goes wrong

Even with a perfect lock service, mutual exclusion breaks if a client pauses or its packets stall longer than the lease. In the **GC pause breaks TTL lock; fencing token saves storage** branch, **Step 2, "Client 1 hits a 15s GC pause; lease expires"** freezes Client 1 for 15 seconds right after acquiring `tok=33`—a bug seen in production systems such as HBase, where stop-the-world GC pauses have lasted minutes. Non-GC processes face the same hazard from disk or EBS page faults, CPU scheduling delays, or network packet delays (such as a 90-second packet delay in a well-known GitHub incident). Checking expiry right before writing fails too, because a pause can occur between the check and the write.

In **Step 3, "Client 2 acquires lock with token 34 and writes"**, Client 2 sees the expired lease, acquires the lock with higher token `34`, and writes `x=B`; storage advances `max_seen` to `34`. When Client 1 resumes in **Step 4, "Client 1 wakes up; storage rejects stale token 33"**, it still believes it holds the lock and sends `PUT x=A (tok=33)`. Storage compares `33 < 34` and rejects the stale write, preventing silent data corruption.

## In practice

Martin Kleppmann separates distributed locks into two distinct use cases:

- **Efficiency locks** avoid duplicate work (such as sending a notification twice or running an expensive computation twice). If occasional lock failure is harmless, a single Redis instance using conditional set-if-not-exists to acquire and atomic delete-if-value-matches to release is simpler and makes the best-effort guarantee explicit.
- **Correctness locks** protect shared state against corruption or data loss. These require a consensus system designed for a partially synchronous model—such as **ZooKeeper** (using `zxid` or a znode version number as the fencing token, often via Apache Curator recipes), or Raft, Viewstamped Replication, Zab, or Paxos—plus token verification inside the storage layer:

```text
put(key, value, token):
  if token < storage.max_seen_token(key):
    reject("stale fencing token")
  storage.max_seen_token(key) = token
  storage.write(key, value)
```

## Pitfalls

- **Using Redlock for correctness.** Redlock runs across 5 Redis nodes with majority voting, yet it does not generate monotonic fencing tokens (it uses random values) and relies on timing assumptions—bounded network delay, bounded pauses, and bounded clock drift—that break if NTP steps a Redis node's `gettimeofday` clock forward or a client hits GC while responses are in flight.
- **Acquiring a lock without enforcing fencing in storage.** A consensus lock service cannot stop an already-issued write from a zombie client; the resource itself must reject writes whose token has gone backward.
- **Paying consensus complexity for best-effort efficiency locks.** Running a five-node Redlock deployment when a duplicate run only costs a few cents adds operational cost without giving correctness guarantees.
- **Assuming non-GC languages cannot pause.** Page faults, scheduler contention, `SIGSTOP`, and delayed IP packets all violate timing bounds just like garbage collection.

## Further reading

- [How to do distributed locking — Martin Kleppmann](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html)
