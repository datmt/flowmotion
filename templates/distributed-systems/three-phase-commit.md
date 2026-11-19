## Why it exists

Two-phase commit (2PC) blocks indefinitely if the coordinator crashes after participants have voted `Yes`, because a prepared participant cannot tell whether the coordinator decided to commit or abort and must hold locks until recovery. **Three-phase commit (3PC)**, formalized by Dale Skeen in 1981, inserts an intermediate **PreCommit** phase between voting and committing so that no participant can reach a committable state while another might still abort. Under crash-stop failures with reliable timeouts, that extra buffer lets participants recover without blocking—yet it breaks safety as soon as the network can partition.

## How it works

3PC splits atomic commitment into three message rounds—`CanCommit`, `PreCommit`, and `DoCommit`—separating the decision to commit from the act of committing.

In **Step 1, "Phase 1: CanCommit"**, the coordinator asks Node A and Node B whether they can execute the transaction. If any node times out or cannot satisfy constraints at this stage, aborting is always safe because no participant has reached `pre-commit`.

In **Step 2, "Participants vote Yes"**, both nodes acquire locks, persist undo/redo logs, reply `Yes`, and move to the `waiting` state. If any participant votes `No`, the coordinator aborts the transaction.

In **Step 3, "Phase 2: PreCommit"**, after collecting unanimous `Yes` votes, the coordinator moves to `pre-commit` and broadcasts `PreCommit`. This extra round guarantees that no node can begin committing while any peer is still undecided in `init`.

In **Step 4, "Participants enter pre-committed state"**, Node A and Node B acknowledge `PreCommit` and transition to `pre-commit`. Reaching `pre-commit` proves every participant voted `Yes`, so if the coordinator crashes later in a fail-stop network, a recovery coordinator (or timeout rule) can safely push the transaction to commit.

In **Step 5, "Phase 3: DoCommit"**, once every `ACK` arrives, the coordinator sends `DoCommit`, and both participants finalize their changes and release locks.

## What goes wrong

Skeen's non-blocking guarantee depends on a fail-stop network with bounded delays and no partitions. In real asynchronous networks, a partition makes an unreachable peer look identical to a crashed one.

In the **Network partition breaks safety** branch, **Step 3, "Partition isolates Node B"** splits the cluster right after both nodes voted `Yes`: `PreCommit` reaches Node A (entering `pre-commit`), while messages to Node B are dropped, leaving Node B stuck in `waiting`.

In **Step 4, "Timeouts choose opposite outcomes"**, both sides time out independently. Following 3PC's timeout rules, Node A commits because it reached `pre-commit`, whereas Node B aborts because it never left `waiting`.

In **Step 5, "Split-brain inconsistency"**, Node A has permanently committed the transaction while Node B has rolled it back, breaking atomicity across the database. Without quorum intersection, timeout-driven state transitions cannot distinguish a crashed node from an isolated one.

## In practice

Pure 3PC is rarely deployed in production databases because it pays an extra round-trip of latency (`PreCommit` plus its ACKs) while still losing safety under network partitions. Instead, modern distributed databases solve 2PC's coordinator-blocking problem by replicating the coordinator and participant state machines with a consensus protocol such as **Paxos** or **Raft** (as in **Google Spanner**, which runs 2PC over Paxos-replicated shards so neither coordinator nor participant is a single point of failure):

```text
3PC phase progression:
  Phase 1: CanCommit  -> Yes / No     (timeout before PreCommit -> Abort)
  Phase 2: PreCommit  -> ACK          (buffer: proves unanimous Yes)
  Phase 3: DoCommit   -> Committed    (timeout after PreCommit  -> Commit)
```

## Pitfalls

- **Deploying 3PC across networks that can partition.** Any asymmetric drop or split between `CanCommit` and `PreCommit` can drive partitioned participants to commit on one side and abort on the other.
- **Confusing non-blocking crash recovery with partition tolerance.** 3PC eliminates blocking only under crash-stop failures with bounded message delivery; it cannot violate the impossibility of consensus in asynchronous networks.
- **Paying three round trips of lock duration unnecessarily.** Holding database locks across three network round trips hurts write throughput and increases lock contention compared to 2PC or consensus-backed atomic commit.
- **Using 3PC where eventual consistency fits better.** For cross-service business workflows without shared locks, a Saga with compensating transactions avoids distributed locking altogether.

## Further reading

- [Wikipedia — Three-phase commit protocol](https://en.wikipedia.org/wiki/Three-phase_commit_protocol)
