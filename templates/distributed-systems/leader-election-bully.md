## Why it exists

When a distributed cluster relies on a single coordinator to schedule jobs or manage shared tasks, the cluster stalls as soon as that coordinator crashes unless the surviving peers agree on a replacement. The **Bully algorithm**—proposed by Hector Garcia-Molina in 1982—elects the surviving process with the highest unique ID by letting higher-ID nodes override ("bully") lower-ID challengers. It is a classic foundation for understanding leader election when every node knows the fixed set of peer IDs and addresses.

## How it works

The algorithm assumes every process knows its own unique ID and the IDs and addresses of all peers, and that processes can detect coordinator silence via timeouts. In **Step 1, "Node 4 acts as coordinator"**, Node 4 holds the highest ID in the four-node group, so it serves work requests as coordinator while Nodes 1 through 3 defer to it.

The protocol uses only three message types: **Election** (sent upward to higher IDs), **Answer / OK** (sent downward to halt a lower challenger), and **Coordinator / Victory** (broadcast downward once a node wins).

## What goes wrong

In the **Coordinator crashes; highest survivor bullies into lead** branch, **Step 2, "Node 4 crashes; Node 2 notices timeout"** takes Node 4 offline. Node 2 times out waiting for Node 4 and initiates an election by sending `ELECTION` to every node with a higher ID—Nodes 3 and 4.

In **Step 3, "Node 3 replies OK and takes over election"**, Node 3 responds `OK (step back)` to Node 2 because `3 > 2`, halting Node 2's candidacy, and immediately starts its own election by sending `ELECTION` to Node 4.

In **Step 4, "No reply from N4 -> Node 3 declares victory"**, Node 4 never answers before the timeout expires. Seeing no higher-ID survivor, Node 3 crowns itself coordinator and broadcasts `COORDINATOR(N3)` to all lower-ID peers (Nodes 2 and 1), updating the cluster's known coordinator to `N3`. If Node 4 later recovers, it immediately runs a new election and reclaims leadership because its ID is higher than `3`.

## In practice

```text
on_coordinator_timeout():
  send ELECTION to all peers with id > self.id
  if no OK arrives within T:
    broadcast COORDINATOR(self.id) to all peers with id < self.id
  else:
    wait for COORDINATOR announcement (restart election if it times out)
```

Because the Bully algorithm assumes a **synchronous system** (bounded message delays, bounded execution times, and reliable delivery) with static global membership, it appears mostly in textbooks, teaching exercises, and tightly controlled local networks rather than wide-area production systems. Production clusters that must tolerate asynchronous delays and network partitions use quorum-based consensus protocols such as **Raft** or coordination services such as **Apache ZooKeeper**, which ensure at most one leader can hold a majority quorum at a time.

## Pitfalls

- **Running the Bully algorithm across networks that can partition.** Because decisions depend solely on local timeouts rather than majority quorums, a network partition causes each isolated group to elect its own highest-ID coordinator—producing split brain.
- **Triggering `O(N^2)` message storms on large clusters.** When the lowest-ID process notices a failure, it sends `N - 1` `ELECTION` messages, triggering a cascade where higher nodes each send `N - 2`, `N - 3`, and so on—`O(N^2)` messages in the worst case.
- **Suffering leadership flapping when the highest-ID node is unstable.** If Node 4 repeatedly crashes and recovers, every recovery immediately bullies Node 3 out of leadership and triggers another election cycle.
- **Relying on timeouts without bounded delays.** Slow GC pauses or congested links look identical to crashes, causing false elections and temporary dual coordinators until messages settle.

## Further reading

- [Bully algorithm — Wikipedia](https://en.wikipedia.org/wiki/Bully_algorithm)
