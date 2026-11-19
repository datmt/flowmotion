## Why it exists

Replicated services frequently need exactly one active leader to schedule jobs, coordinate shard ownership, or accept writes, yet implementing consensus from scratch inside every application is hard to get right. **ZooKeeper leader election** delegates consensus to an existing Apache ZooKeeper ensemble using a client-side convention built on **ephemeral sequential znodes** and single-predecessor watches. When the active leader crashes or loses its session, ZooKeeper automatically removes its znode and notifies only the next candidate in line, preventing a thundering **herd effect** on the coordination service.

## How it works

All candidate servers volunteer under a shared parent path such as `/election`, using two ZooKeeper node flags together: `EPHEMERAL` (automatically deleted if the creator's session ends) and `SEQUENCE` (ZooKeeper appends a strictly increasing numeric suffix greater than any previously appended child).

In **Step 1, "Each server creates an ephemeral sequential znode"**, Servers 1, 2, and 3 each issue `create` with both `EPHEMERAL` and `SEQUENCE` flags under `/election`, producing `/election/n_001` (S1), `/election/n_002` (S2), and `/election/n_003` (S3).

In **Step 2, "Lowest sequence leads; others watch predecessor"**, each server calls `getChildren("/election")` **without** setting a watch on the parent directory and compares sequence numbers. Server 1 holds the smallest suffix (`n_001`) and immediately becomes leader. Rather than having every standby watch `n_001` (which would wake the entire fleet at once), Server 2 sets an `exists` watch solely on its immediate predecessor `n_001`, and Server 3 watches only `n_002`.

## What goes wrong

Leaders crash, hang, or get partitioned from the ensemble without gracefully stepping down. In the **Session expiry deletes znode and promotes S2** branch, **Step 3, "Server 1 crashes; session expires"** shows Server 1 stopping heartbeats to ZooKeeper. Once its session times out, the ensemble automatically deletes its ephemeral znode `n_001`.

In **Step 4, "Only Server 2 is notified (no herd effect)"**, ZooKeeper fires a single deletion watch notification to Server 2—the only client watching `n_001`. Server 3 remains undisturbed because its watched predecessor `n_002` still exists.

In **Step 5, "Server 2 verifies lowest sequence and leads"**, Server 2 calls `getChildren("/election")` to fetch the current child list (`[n_002, n_003]`), confirms that no smaller znode remains, and promotes itself to leader. Checking `getChildren()` again is essential: if a middle standby (such as S2) dies while S1 is still alive, S3 receives a deletion event for `n_002`, inspects the children, sees `n_001` is still smaller, and re-watches `n_001` instead of claiming leadership prematurely.

## In practice

Apache ZooKeeper's official **Leader Election** recipe is implemented purely as a client-side convention with no special server-side election RPC:

```text
ZooKeeper Leader Election recipe:
  1. z = create("/election/<guid>-n_", EPHEMERAL | SEQUENCE)
  2. C = getChildren("/election", watch=false)
  3. If z has the smallest sequence in C: execute leader procedure
  4. Else: let p be the znode in C with the largest sequence < z
     If exists(p, watch=true) is null: goto step 2
     Else: wait for deletion watch on p, then goto step 2
```

Notice the client-generated `<guid>` prefix in step 1: if a recoverable network error interrupts `create()` after the ZooKeeper server already committed the znode, the client inspects `getChildren()` for its own `<guid>` instead of creating a duplicate orphaned proposal.

## Pitfalls

- **Having every candidate watch `/election` or the current leader's znode.** In large clusters, waking all candidates simultaneously on leader failure triggers a **herd effect** of concurrent `getChildren()` spikes against ZooKeeper.
- **Assuming leadership immediately upon receiving a predecessor watch event.** The deleted znode might have belonged to a crashed standby rather than the leader; always call `getChildren()` again to verify you now own the smallest sequence number.
- **Skipping the `exists() == null` check when placing a watch.** If your predecessor vanishes between `getChildren()` and `exists()`, no watch will ever fire; loop back to `getChildren()` immediately.
- **Omitting a client GUID from the znode prefix.** Without a unique prefix, recovering from a lost `create()` reply can leave an orphaned ephemeral znode holding leadership while the client thinks creation failed.
- **Assuming the smallest znode guarantees the new leader is already running or the old leader has stopped.** As ZooKeeper's recipe notes, a node can become smallest before running its leader startup procedure, and a paused old leader may not know its session expired yet—use an explicit acknowledgement znode or fencing token where downstream writes require strict exclusivity.

## Further reading

- [Apache ZooKeeper Documentation — Recipes and Solutions: Leader Election](https://zookeeper.apache.org/doc/current/recipes.html#sc_leaderElection)
