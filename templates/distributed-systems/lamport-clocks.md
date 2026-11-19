## Why it exists

Physical clocks on separate machines drift and cannot reliably tell whether an event on one server happened before an event on another. In his 1978 paper Time, Clocks, and the Ordering of Events in a Distributed System, Leslie Lamport replaced wall-clock time with a single integer counter per process—a **Lamport logical clock**—that respects the causal **happened-before** relation (`->`). Distributed databases, lock protocols, and replicated logs use logical timestamps whenever processes need a consistent ordering of causally linked events without synchronized physical clocks.

## How it works

Lamport defines `a -> b` ("`a` happened before `b`") by three rules: `a` precedes `b` within the same process; `a` is sending a message and `b` is receiving it; or transitively `a -> x` and `x -> b`. A logical clock `C` satisfies the **Clock Condition** if `a -> b` implies `C(a) < C(b)`, enforced by two rules:

- **IR1:** Increment local counter `C_i` between any two successive events in process `P_i`.
- **IR2:** Tag every sent message with the sender's timestamp `t`; on receipt, advance the receiver's counter to `max(C_j, t) + 1`.

In **Step 1, "Node A performs local event e1"**, Node A increments its counter to `L(A) = 1`. In **Step 2, "Node A sends (m1, t=1) to Node B"**, Node A attaches `t=1` to `m1`, and Node B updates `L(B) = max(0, 1) + 1 = 2`. In **Step 3, "Node B sends (m2, t=2) to Node C"**, forwarding the causal successor drives Node C to `max(0, 2) + 1 = 3`, preserving `e1 -> e2 -> e3 => 1 < 2 < 3`. (When receive and send are modeled as separate events rather than one relay event, IR1 increments Node B to `3` before sending `m2`, advancing Node C to `4`.)

## What goes wrong

Network delays expose both the strength and the fundamental limit of scalar logical clocks. In the **Out-of-order message and concurrency limit** branch, **Step 2, "Node B executes 4 local events first"** advances Node B's counter to `L(B) = 4` while A's message `(t=1)` is delayed in flight.

In **Step 3, "Delayed message (t=1) arrives at Node B"**, `m1 (t=1)` finally reaches B. Taking `max(4, 1) + 1 = 5` guarantees Node B's clock moves monotonically forward and satisfies `C(send) < C(recv)` (`1 < 5`).

However, **Step 4, "L(a) < L(b) does NOT prove causality"** shows why the converse fails: `L(e1) = 1 < L(B's 4th event) = 4`, even though neither event could causally affect the other. As Lamport proved, no scalar clock can satisfy the converse: if `p2 -> p3` on one process are both concurrent with `q3` on another, forcing concurrent events to share a timestamp would contradict `C(p2) < C(p3)`.

## In practice

Lamport's primary reason for introducing logical clocks was to extend the `->` partial order into a deterministic **total ordering** across all processes by breaking equal-timestamp ties with an arbitrary total ordering `<` of process IDs:

```text
on_local_or_send():
  L = L + 1
  return (L, self_id)

on_receive(t):
  L = max(L, t) + 1

order(a, b):
  return a.L < b.L or (a.L == b.L and a.pid < b.pid)
```

In the paper, Lamport uses this `(timestamp, process_id)` total order to solve distributed mutual exclusion so every process grants resource requests in an identical order without a central scheduler. Because a Lamport clock is a single integer (`O(1)` space and message overhead), it remains widely used for tie-breaking version numbers, transaction epochs, and log ordering whenever full concurrency detection is unnecessary.

## Pitfalls

- **Treating `L(a) < L(b)` as causal dependence.** A smaller Lamport timestamp only means `b` did not happen before `a`; two events with different timestamps may still be concurrent. Use vector clocks when you must detect concurrent conflicts.
- **Forgetting to break ties with process IDs.** Independent processes routinely generate the same integer timestamp; without a deterministic tie-breaker `(L, pid)`, the ordering is not total.
- **Expecting logical clocks to capture out-of-band causality.** If a user triggers an action on Server A and then calls someone by phone to trigger an action on Server B with no network message between A and B, logical clocks cannot detect that external ordering—Lamport's paper notes this anomaly requires synchronized physical clocks.
- **Skipping the increment between receive and send.** Reusing the receive timestamp on a subsequent distinct send event violates rule IR1 and breaks strict inequality within the sending process.

## Further reading

- [Time, Clocks, and the Ordering of Events in a Distributed System — Leslie Lamport (CACM, July 1978)](https://lamport.azurewebsites.net/pubs/time-clocks.pdf)
