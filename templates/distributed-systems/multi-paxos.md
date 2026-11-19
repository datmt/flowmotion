## Why it exists

Single-decree Paxos agrees on just one value and requires two network round trips (Phase 1 Prepare/Promise, then Phase 2 Accept/Accepted) to do it. Building a fault-tolerant replicated state machine requires agreeing on an infinite ordered sequence of log commands, and paying two round trips per command halves throughput and doubles latency. **Multi-Paxos**—described in the state-machine section of Leslie Lamport's Paxos Made Simple (2001)—elects a stable leader that runs Phase 1 once across all future log slots so normal writes commit in a single round trip.

## How it works

A Multi-Paxos cluster runs an independent Paxos instance for each log slot (`s1`, `s2`, `s3`, ...) while sharing one leader ballot across them. In **Step 1, "Run Phase 1 once for all future slots"**, Leader L1 sends `Prepare(b=1)` to a majority of acceptors (A1 and A2 out of three). Their `Promise` responses establish L1 as the distinguished proposer for every future log slot at ballot `b=1`.

In **Step 2, "Slot 1: skip Prepare, send Accept"**, a client submits `SET x=1`. Because acceptors have already promised not to accept proposals numbered below `b=1` for any slot, L1 skips Phase 1 and sends `Accept(b=1, s1, x=1)` directly—committing in 1 RTT once a majority accepts.

In **Step 3, "Slot 2: steady-state replication"**, `SET y=2` likewise commits in 1 RTT. In **Step 4, "Slot 3 only reaches A1"**, L1 sends `Accept(b=1, s3, z=3)` to A1, leaving slot 3 pending before A2 or A3 receives it.

## What goes wrong

When the leader crashes mid-replication, in-flight slots may exist on some acceptors without having reached a majority. In the **Leader crashes; L2 recovers slot 3** branch, **Step 5, "L1 crashes mid-replication"** takes L1 offline; Replica L2 detects missed heartbeats and steps up with a higher ballot `b=2`.

In **Step 6, "L2 runs Phase 1 with b=2"**, L2 sends `Prepare(b=2)` to a majority quorum (A1 and A2). A1 promises not to accept lower ballots and reports the highest accepted entry it holds for slot 3: `(b=1, z=3)`, while A2 reports `none`.

In **Step 7, "L2 adopts and commits z=3"**, L2 must re-propose `z=3` at `b=2` rather than overwriting slot 3 with a new client command. Under Lamport's **P2c** invariant, because any two majorities intersect, checking a majority in Phase 1 guarantees L2 discovers any value that might already have been chosen; adopting the highest-numbered accepted value preserves consensus safety. If an earlier log slot has no accepted value in the quorum, the new leader fills the gap with a `no-op` command before resuming 1-RTT writes for `s4+`.

## In practice

Production consensus engines use Multi-Paxos variants to replicate ordered logs across machines and datacenters:

- **Google Chubby** (2006) runs a Multi-Paxos leader for its distributed lock service and cluster metadata store.
- **Google Spanner** (2012) partitions data into shards where each shard is replicated by its own Paxos state machine group, combining Multi-Paxos with TrueTime for external consistency.

```text
steady_state_propose(slot, cmd):
  send Accept(ballot, slot, cmd) to acceptors
  wait for majority Accepted
  commit(slot, cmd)
```

To support live cluster membership changes without halting the log, Lamport's reconfiguration scheme ties acceptor membership to log slots via a window parameter `alpha`: a membership change decided in slot `i` takes effect at slot `i + alpha`, allowing up to `alpha` concurrent slots to be in flight safely.

## Pitfalls

- **Allowing multiple active leaders simultaneously.** Two nodes repeatedly issuing higher `Prepare` ballots trigger **dueling proposers**, preserving safety while destroying liveness and reverting throughput below 2 RTTs.
- **Overwriting partially accepted slots on leader failover.** Skipping Phase 1 recovery or discarding an acceptor's reported `(b=1, z=3)` violates invariant P2c and can overwrite a value another majority already committed.
- **Forgetting to fill log gaps with `no-op` entries.** Because state machines must apply commands in strict slot order, an empty slot blocks execution of all higher slots until the new leader explicitly commits a `no-op` there.
- **Changing cluster membership immediately on the next slot.** Switching acceptor quorums without a bounded `alpha` window (or joint consensus) can allow two disjoint majorities to commit conflicting commands for the same slot.

## Further reading

- [Paxos Made Simple — Leslie Lamport (2001)](https://lamport.azurewebsites.net/pubs/paxos-simple.pdf)
