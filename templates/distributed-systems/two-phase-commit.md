## Why it exists

When a single logical transaction must update two independent databases—such as debiting Accounts DB and crediting Ledger DB—committing each database separately risks partial updates if one server crashes or violates a constraint. **Two-phase commit (2PC)** is an atomic commitment protocol that guarantees every participating database either commits the transaction or aborts it together, even across process crashes. Distributed databases and enterprise transaction managers rely on 2PC whenever strict all-or-nothing atomicity matters more than lock-free availability.

## How it works

A **Coordinator** drives all **Participants** through two sequential rounds—the **commit-request (voting) phase** and the **commit phase**—using durable write-ahead logs (WALs) so decisions survive restarts.

In **Step 1, "Client starts transaction"**, the client requests `Transfer $100`, and the coordinator opens a global transaction and logs `BEGIN`.

In **Step 2, "Phase 1: Prepare"**, the coordinator sends `Prepare` to Accounts DB and Ledger DB, asking each whether it can guarantee local commit.

In **Step 3, "Participants flush WAL and vote Yes"**, both databases execute the transfer tentatively, flush undo/redo records to their durable write-ahead logs, hold row locks, and reply `Vote-Yes`. Voting `Yes` is a binding promise: once prepared, a participant must be able to commit even after a crash and may no longer abort unilaterally. (If any participant votes `No` or times out, the coordinator sends `Abort` to everyone.)

In **Step 4, "Coordinator logs the commit point"**, after collecting unanimous `Vote-Yes` replies, the coordinator fsyncs `COMMIT` to its own transaction log. This single durable write is the atomic point of no return—even if the coordinator crashes immediately afterward, recovery must finish committing.

In **Step 5, "Phase 2: Commit and release locks"**, the coordinator broadcasts `Commit` to both databases. Each database applies the commit record, releases its locks, and acknowledges, and the coordinator returns `OK` to the client.

## What goes wrong

2PC's classic weakness is that it is a **blocking protocol**. In the **Coordinator crashes after Prepare** branch, **Step 4, "Coordinator crashes before deciding"** kills the coordinator right after both databases have voted `Yes`, before any `Commit` or `Abort` message goes out.

In **Step 5, "Participants block in-doubt"**, Accounts DB and Ledger DB sit in an uncertain (`in-doubt`) state: neither knows whether the coordinator logged `COMMIT` before dying (and perhaps already told another participant to commit) or died before deciding. Neither database can safely commit or abort on its own, so both must remain blocked holding row locks until the coordinator recovers and reads its log—stalling every other transaction touching those rows.

## In practice

**X/Open XA** standardizes 2PC between a global **Transaction Manager** (coordinator) and heterogeneous **Resource Managers** (relational databases such as PostgreSQL `PREPARE TRANSACTION` / `COMMIT PREPARED`, MySQL XA, and message brokers).

```sql
PREPARE TRANSACTION 'tx_transfer_100';
COMMIT PREPARED 'tx_transfer_100';
```

Production 2PC engines reduce disk-sync and message overhead with **presumed abort** (treating any transaction absent from the coordinator's log as aborted, eliminating forced abort logs and abort acknowledgements) or **presumed commit** (optimizing for mostly committing workloads at extra recovery complexity). Modern distributed SQL stores such as Google Spanner run 2PC on top of Paxos-replicated shards so the coordinator itself is highly available and does not leave participants blocked on single-machine crashes.

## Pitfalls

- **Running 2PC over an un-replicated coordinator in latency-sensitive paths.** A single coordinator crash leaves prepared participants holding database locks until the coordinator machine and its log come back online.
- **Spanning 2PC across independent microservices owned by separate teams.** Holding locks across wide networks and external service boundaries couples availability directly across services; prefer a Saga with compensating transactions for cross-service business flows.
- **Forgetting operational monitoring for orphaned prepared transactions.** In-doubt transactions in PostgreSQL or MySQL XA keep row locks and vacuum horizons pinned indefinitely until resolved by coordinator recovery or manual intervention.
- **Ignoring the double fsync latency cost.** Every 2PC commit forces durable log flushes at participants during Phase 1 and at the coordinator before Phase 2, adding two network round trips and multiple disk syncs to write latency.

## Further reading

- [Wikipedia — Two-phase commit protocol](https://en.wikipedia.org/wiki/Two-phase_commit_protocol)
