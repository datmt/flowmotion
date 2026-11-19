## Why it exists

Replicating a single decision across unreliable machines over an asynchronous network—where nodes crash and packets arrive late, duplicated, or out of order—fails if two nodes independently commit conflicting values. **Single-decree Paxos**, presented in plain English in Leslie Lamport's Paxos Made Simple (2001), guarantees that at most one value is ever chosen even when proposers race and networks partition. Consensus engines, lock services, and replicated metadata stores build on Paxos whenever safety must hold under arbitrary message delays.

## How it works

Paxos separates processes into three logical roles: **proposers** (which suggest values), **acceptors** (which vote and persist state), and **learners** (which discover the chosen value). A value is chosen once a majority quorum of acceptors (here 2 of 3) accepts the same proposal.

In **Step 1, "Phase 1a: Prepare(n=1)"**, Proposer P1 selects a unique ballot number `1` and sends `Prepare(1)` to a majority of acceptors (A1 and A2). In **Step 2, "Phase 1b: Promise"**, A1 and A2 have not seen a higher ballot, so they record `promised = 1`, promise never to accept any proposal numbered below `1`, and reply `Promise(none)` because they have accepted nothing yet.

In **Step 3, "Phase 2a: Accept(1, X)"**, because no acceptor in the promise quorum returned a previously accepted value, P1 is free to propose its own value `X` with `Accept(1, X)`. Had any acceptor returned a prior value, Lamport's invariant **P2c** would force P1 to propose the value with the highest accepted ballot number reported by that quorum instead.

In **Step 4, "Phase 2b: Value X is chosen"**, A1 and A2 verify `1 >= promised`, persist `(1, X)`, and reply `Accepted`. Once a majority accepts, `X` is irrevocably chosen: any later majority overlaps `{A1, A2}` in at least one acceptor, so every higher ballot will discover `X` in Phase 1 and preserve it.

## What goes wrong

Paxos always guarantees safety under asynchronous delays, yet liveness can stall when proposers compete. In the **Competing proposers livelock** branch, **Step 3, "P2 sends higher Prepare(2)"** interrupts P1 between Phase 1 and Phase 2: Proposer P2 sends `Prepare(2)` to A2 and A3, bumping their promised ballot to `2`.

In **Step 4, "P1's Accept(1, X) is rejected"**, A1 accepts `(1, X)` but A2 rejects ballot `1` (`NACK (b=2)`) because it already promised `2`, preventing P1 from forming a majority.

In **Step 5, "Dueling proposers can livelock"**, P1 retries with `Prepare(3)` against A2 and A3, preempting P2's `Accept(2, Y)` before it can land. Without coordination, two proposers can indefinitely outbid each other so neither ever completes Phase 2.

## In practice

Single-decree Paxos is the building block for replicated state machines rather than a standalone log protocol:

```text
Phase 1a: Proposer -> Majority: Prepare(n)
Phase 1b: Acceptor -> Proposer: Promise(n, highest_accepted_b, highest_accepted_v)
Phase 2a: Proposer -> Majority: Accept(n, v = highest_v or own_value)
Phase 2b: Acceptor -> Proposer: Accepted(n, v) if n >= promised
```

To prevent dueling proposers and avoid paying 2 RTTs per decision, production systems such as **Google Chubby** and **Google Spanner** elect a single **distinguished proposer** (leader) using randomized backoff or leases and run **Multi-Paxos**, executing Phase 1 once for all future log slots and committing steady-state commands in 1 RTT.

## Pitfalls

- **Letting two proposers share the same ballot number.** Ballot numbers must be globally unique (for example, `(round, server_id)`) so two proposers never propose different values under the same number.
- **Accepting or promising without persisting state to durable storage.** If an acceptor forgets its `promised` ballot or `(accepted_ballot, accepted_value)` across a crash and restart, it can violate safety by accepting a conflicting value.
- **Running single-decree Paxos without leader election or backoff.** Uncoordinated proposers easily trigger dueling-proposer livelocks under load.
- **Choosing an even acceptor count without awareness of fault tolerance.** A 3-acceptor cluster tolerates 1 failure (`quorum = 2`); adding a 4th acceptor raises the quorum to 3 while still tolerating only 1 failure.

## Further reading

- [Paxos Made Simple — Leslie Lamport (2001)](https://lamport.azurewebsites.net/pubs/paxos-simple.pdf)
