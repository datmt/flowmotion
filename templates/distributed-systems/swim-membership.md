## Why it exists

Traditional all-to-all heartbeating membership protocols break down past a few dozen nodes: broadcasting heartbeats to every peer creates quadratic (`O(N^2)`) network traffic, while lengthening heartbeat intervals slows failure detection or spikes false positives. **SWIM** (Scalable Weakly-consistent Infection-style Process Group Membership Protocol, Das, Gupta, and Motivala) solves this by separating **failure detection** from **membership dissemination**. Each node probes only one peer per protocol period—keeping per-member message load and expected detection time `O(1)` regardless of cluster size—and piggybacks membership updates onto those existing probe packets so changes spread in `O(log N)` periods.

## How it works

Every protocol period `T` (which requires no synchronized clocks across machines), each member runs one randomized probe cycle and piggybacks recent membership updates onto its `ping`, `ping-req`, and `ack` UDP packets.

In **Step 1, "Direct ping to random target"**, Node 1 selects Node 4 and sends a direct `ping`. Probing one peer per period keeps every node's expected traffic near two messages per period regardless of group size; SWIM's round-robin shuffled traversal (Section 4.3) guarantees every peer is probed within `2N` periods (time-bounded completeness).

In **Step 2, "No ack: avoid premature eviction"**, no `ack` arrives before the round-trip timeout. Because congestion on the direct link between Node 1 and Node 4 could drop packets even when Node 4 is healthy, SWIM does not evict Node 4 yet.

In **Step 3, "Indirect ping-req through k helpers"**, Node 1 picks `k` random helpers (Nodes 2 and 3) and sends `ping-req(N4)`. Each helper pings Node 4 over an independent network path and relays any `ack` back to Node 1.

In **Step 4, "Mark Suspect and piggyback update"**, neither helper gets a reply. Rather than declaring Node 4 dead immediately, SWIM's **Suspicion** subprotocol marks Node 4 `suspect` at incarnation `1` and piggybacks `suspect(N4,1)` onto subsequent protocol packets so the update spreads epidemically without extra multicast packets.

In **Step 5, "Suspicion timeout -> Confirmed Dead"**, Node 4 never responds before the suspicion timer expires, so Node 1 promotes it to confirmed dead (`Confirm`), deletes it from membership, and piggybacks the confirmation across the cluster.

## What goes wrong

In asynchronous networks, a slow host, garbage-collection pause, or packet burst is indistinguishable from a crash, causing false failure detections that needlessly evict healthy nodes. The **False suspicion refuted by incarnation** branch shows how SWIM lets a temporarily stalled node save itself before confirmation.

In **Step 5, "Node 4 recovers from brief pause"**, Node 4 finishes its pause and receives the gossiped `suspect(N4,1)` update from Node 2 while still inside the suspicion timeout window.

In **Step 6, "Bump incarnation number to refute"**, only a member itself may increment its own **incarnation number** (initialized to `0` at join). Node 4 increments `inc` from `1` to `2` and disseminates `alive(N4,2)`.

In **Step 7, "Higher incarnation overrides suspicion"**, peers apply SWIM's precedence rules—`Alive(inc=2)` overrides `Suspect(inc=1)` because `2 > 1`—clearing the false suspicion without forcing Node 4 to leave and rejoin.

## In practice

In the original Cornell prototype, packets stayed capped at **135 bytes** (piggybacking up to 6 updates per UDP packet) with a 2-second protocol period, maintaining roughly **2 messages per member per period** up to 55 members. **HashiCorp memberlist** (powering **Serf** and **Consul**) runs SWIM with **Lifeguard** extensions and LAN defaults:

```text
HashiCorp memberlist LAN defaults:
  ProbeInterval   = 1s
  ProbeTimeout    = 500ms
  IndirectChecks  = 3 (k helpers)
  SuspicionMult   = 4 (timeout scales with SuspicionMult * log(N + 1) * ProbeInterval)
```

Lifeguard adds indirect-probe `nack`s and a **Local Health Multiplier** (`1 + LHM`) that slows a locally overloaded node's own timers so a CPU-starved prober stops broadcasting false suspicions about healthy peers.

## Pitfalls

- **Using SWIM when you need strongly consistent membership.** SWIM deliberately provides **weakly consistent** membership lists; if your application requires all nodes to agree on exact membership views at the same causal point, use consensus (Raft, Paxos, or ZooKeeper) instead.
- **Setting the protocol period shorter than three round-trip times.** Das et al. note the protocol period `T` must be at least `3x` the RTT estimate so both direct and indirect probes have time to finish within one tick.
- **Making suspicion timeout static across growing clusters.** If the suspicion timeout is shorter than epidemic dissemination time (`O(log N)` periods), a suspected healthy node may never hear about its suspicion in time to refute it.
- **Ignoring local CPU or packet-queue stalls on the prober.** Without self-awareness like Lifeguard, a congested prober drops incoming `ack`s and triggers waves of false suspicions across the cluster.

## Further reading

- [SWIM: Scalable Weakly-consistent Infection-style Process Group Membership Protocol — Das, Gupta, and Motivala (Cornell University, 2002)](https://www.cs.cornell.edu/projects/Quicksilver/public_pdfs/SWIM.pdf)
