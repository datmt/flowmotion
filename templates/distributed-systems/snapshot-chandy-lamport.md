## Why it exists

A distributed system has no shared memory and no perfectly synchronized global clock, so recording every process at the same wall-clock instant can miss money or work currently in transit on the network—or capture an impossible state where a message is received before it was sent. The **Chandy-Lamport algorithm** (K. Mani Chandy and Leslie Lamport, 1985) records a **consistent global state**—both process states and in-flight channel messages—without pausing application execution. Distributed checkpointing, deadlock detection, and stream processors use this marker-based cut to inspect or recover live systems without stop-the-world freezes.

## How it works

The algorithm assumes unidirectional **FIFO (First-In, First-Out)** communication channels and uses a special control message called a **marker** to separate events before and after the snapshot on each link.

In **Step 1, "P2 initiates snapshot and sends Marker"**, P2 starts the snapshot by recording its own local state (`$100`), beginning to record incoming messages on its input channels, and sending a `Marker` out along its outgoing channel toward P1.

In **Step 2, "P1 receives Marker, saves state, echoes Marker"**, P1 receives its first `Marker`. Following the marker-receiving rule, P1 records its local state (`$100`), marks the incoming channel (`P2 -> P1`) as empty, and sends a `Marker` on its outgoing FIFO channel (`P1 -> P2`). When no transfer is in flight, P2 receives P1's marker with nothing queued ahead of it, closes recording on `P1 -> P2`, and the snapshot totals `$100 + $100 + $0 = $200`.

## What goes wrong

Capturing process states alone fails whenever messages cross the snapshot boundary mid-flight. The **In-flight transfer captured in channel state** branch shows how FIFO markers preserve conservation of funds.

In **Step 2, "P1 had already sent $30 before seeing Marker"**, P1 sends `$30` to P2 just before P2's marker arrives, dropping P1's local balance to `$70` while `$30` travels on `P1 -> P2`.

In **Step 3, "P1 receives Marker and records $70"**, P1 receives P2's marker, saves its post-send balance (`$70`), and places its own `Marker` onto `P1 -> P2` behind the `$30` message.

In **Step 4, "P2 logs in-flight $30 before P1's Marker closes channel"**, because `P1 -> P2` is FIFO, the `$30` arrives at P2 ahead of P1's marker. P2 had already recorded `$100` and started logging `P1 -> P2`, so it appends `$30` to channel state `chan-12` before P1's marker stops recording. Even though P2's live balance moves to `$130`, the recorded snapshot holds `P1=$70`, `P2=$100`, and `chan-12=$30`—preserving the exact `$200` invariant. If the channel were not FIFO and P1's marker overtook the `$30`, the money would vanish from the snapshot.

## In practice

**Apache Flink** adapts Chandy-Lamport for fault-tolerant stream processing via **Asynchronous Barrier Snapshotting (ABS)**. Instead of halting pipelines to checkpoint operator state, Flink injects **checkpoint barriers** (its equivalent of markers) at stream sources:

```text
Chandy-Lamport marker rules:
  1. Initiator: record local state; start logging all incoming channels;
     send Marker on every outgoing channel.
  2. First Marker on channel c: record local state; record c as empty;
     start logging all other incoming channels; send Marker on outgoing channels.
  3. Subsequent Marker on channel c': stop logging c' (logged messages = state of c').
```

In Flink's **aligned checkpoints**, multi-input operators pause faster channels until barriers arrive on all inputs, avoiding channel-state buffering; in **unaligned checkpoints** (used under heavy backpressure), operators snapshot in-flight channel buffers alongside operator state, closely mirroring Chandy-Lamport's channel logs.

## Pitfalls

- **Running the algorithm over non-FIFO channels.** If a marker overtakes an earlier application message (for example, over raw UDP or multi-path routing without sequence numbers), the in-flight message is omitted and the snapshot becomes inconsistent.
- **Expecting the recorded global state to have occurred at a single wall-clock instant.** Chandy-Lamport captures a **consistent cut** (a state reachable in an equivalent execution that respects causality), not a simultaneous physical-time freeze.
- **Ignoring network partitions or lost markers.** The classic 1985 algorithm assumes reliable, strongly connected FIFO channels where markers are never dropped; real implementations rely on reliable transports (such as TCP) and timeout/retry wrappers.
- **Underestimating channel-buffer memory under heavy traffic.** Recording every in-flight message until all incoming markers arrive can buffer large payloads when slow links or backpressure delay markers.

## Further reading

- [Distributed Snapshots: Determining Global States of Distributed Systems — K. Mani Chandy and Leslie Lamport (ACM TOCS, 1985)](https://lamport.azurewebsites.net/pubs/chandy.pdf)
