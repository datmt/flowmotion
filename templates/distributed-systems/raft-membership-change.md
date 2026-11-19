## Why it exists

Replacing failed servers or resizing a consensus cluster by taking every node offline causes downtime and invites operator error, yet switching live servers directly from an old membership (`C_old`) to a new one (`C_new`) is unsafe because servers never switch at the exact same instant. During a direct switch, two disjoint majorities—one under `C_old` and one under `C_new`—can elect two leaders in the same term. Raft's **joint consensus** (Section 6 of Ongaro and Ousterhout, 2014) transitions membership in two replicated log phases so no split quorum can ever form.

## How it works

Configuration changes travel through the replicated log as special entries, and every server immediately uses the latest configuration entry in its log—even before that entry commits.

In **Step 1, "Cluster starts in C_old = {S1, S2, S3}"**, the three-server cluster requires 2 of 3 votes from `{S1, S2, S3}` for elections and commits.

In **Step 2, "Phase 1: append and replicate C_old,new"**, to replace S1 with S4 (`C_new = {S2, S3, S4}`), leader S1 appends the transitional **joint consensus** entry `C_old,new` and replicates it to all servers in both configurations. Under `C_old,new`, every election and log commitment requires separate majorities from both `C_old` and `C_new`.

In **Step 3, "C_old,new commits with dual majorities"**, S2, S3, and S4 acknowledge `C_old,new`, satisfying majorities in both `{S1, S2, S3}` and `{S2, S3, S4}`. Once `C_old,new` is committed, neither `C_old` nor `C_new` can act unilaterally, and Leader Completeness guarantees only a server holding `C_old,new` can become leader.

## What goes wrong

A subtle edge case occurs when a configuration change removes the active leader itself. In the **Removing the current leader cleanly** branch, **Step 4, "Phase 2: S1 appends C_new = {S2, S3, S4}"** has S1 append `C_new`—a configuration that excludes S1. While replicating `C_new`, S1 continues managing the log but does not count itself toward `C_new`'s majority.

In **Step 5, "C_new commits: S1 steps down"**, S2, S3, and S4 acknowledge `C_new`. Only at the moment `C_new` commits—the earliest point at which `C_new` is guaranteed able to operate independently—does S1 step down to follower and leave the cluster. In **Step 6, "Remaining cluster elects S2 safely"**, `{S2, S3, S4}` elect S2 under `C_new` with every committed entry intact and zero split-brain window.

## In practice

Section 6 of the Raft paper highlights two operational mechanisms that accompany joint consensus so reconfigurations stay available in production:

- **Non-voting catch-up phase:** Brand-new servers start with an empty log. Adding them immediately as voting members can stall commits while they copy snapshots and log entries. Raft first joins new servers as non-voting learners until they catch up, then appends `C_old,new`.
- **Disruptive removed-server protection:** A removed server like S1 stops receiving heartbeats, times out, and broadcasts `RequestVote` with higher terms that would otherwise depose the live leader. Raft prevents this by having servers ignore `RequestVote` RPCs received within the minimum election timeout of hearing from a current leader.

```text
Phase 0: add new server as non-voting learner until log catches up
Phase 1: leader appends and commits C_old,new  (majority of C_old AND C_new)
Phase 2: leader appends and commits C_new      (majority of C_new)
Step-down: if leader not in C_new, step down once C_new commits
```

## Pitfalls

- **Switching directly from `C_old` to `C_new` in one log entry.** Because servers receive the entry at different times, a subset still on `C_old` and a subset already on `C_new` can form two independent majorities in the same term.
- **Starting `C_new` before `C_old,new` is committed.** If the leader crashes before `C_old,new` commits, `C_old` could still elect a leader without `C_old,new`; never append `C_new` until `C_old,new` is committed.
- **Letting the outgoing leader step down before `C_new` commits.** Stepping down early can leave a cluster where only a server in `C_old` can be elected, stalling the transition.
- **Ignoring `RequestVote` traffic from decommissioned nodes.** Without minimum-election-timeout filtering, an un-shut-down removed node repeatedly bumps cluster terms and triggers needless failovers.

## Further reading

- [In Search of an Understandable Consensus Algorithm — Diego Ongaro and John Ousterhout (USENIX ATC 2014)](https://raft.github.io/raft.pdf)
