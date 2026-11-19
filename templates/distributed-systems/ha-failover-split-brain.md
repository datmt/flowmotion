## Why it exists

High-availability clusters monitor peers with heartbeats so a standby can take over when the primary crashes, yet a broken heartbeat network looks identical to a dead primary. If the standby promotes while the original primary is still running and writing to shared storage, both nodes accept conflicting writes and corrupt the dataset—a failure known as **split brain**. Active-passive databases, SAN-backed clusters, and stateful HA pairs rely on quorum arbitration and hardware fencing to guarantee a single writer across failovers.

## How it works

In **Step 1, "Primary A serves writes and replicates to B"**, Primary A is the sole writer to Shared Storage and streams replication updates and regular heartbeats to Standby B.

When Primary A becomes unresponsive in **Step 2, "Primary A fails; controller fences A first"**, Standby B does not immediately promote. First, the Fencing Controller executes **STONITH** ("Shoot The Other Node In The Head"), forcefully powering off Primary A or revoking its storage access so A is guaranteed incapable of issuing further writes.

Only after fencing succeeds does **Step 3, "Standby B promotes safely to Primary"** promote Standby B and shift client writes (`x=2`) onto it. Separating failure detection from promotion with an explicit fencing barrier preserves the single-writer invariant even when the old primary was merely frozen or partitioned rather than cleanly shut down.

## What goes wrong

In the **Partition without fencing causes split brain** branch, **Step 2, "Heartbeat link breaks while both nodes live"** severs the interconnect between A and B while Primary A remains healthy and reachable by clients. Because heartbeats stop arriving, Standby B assumes Primary A has crashed.

In **Step 3, "Unfenced B promotes -> two active primaries"**, Standby B promotes itself without fencing Primary A or winning a quorum tie-breaker. Clients now write `x=2` to Primary A and `x=9` to rogue Primary B simultaneously against Shared Storage, causing uncoordinated concurrent writes, race conditions, and data corruption.

## In practice

Production HA stacks such as **Pacemaker** with **Corosync** combine three defenses to make failover safe:

- **Odd-sized majority quorum:** A partition may operate only if it holds a strict majority (`floor(N / 2) + 1`) of voting nodes—for example, 2 of 3—while the minority partition stops its services or fences itself.
- **External witness (quorum device):** Because a 2-node cluster cannot form a strict majority when split 1 versus 1, an independent external witness or `qdevice` provides a third arbitration vote so only the node that reaches the witness can take over.
- **Hardware and storage fencing:** Even with quorum, a frozen or zombie node can attempt delayed writes. Clusters enforce STONITH via IPMI, managed power distribution units (PDUs), or watchdog timers, or use **SCSI-3 persistent reservations** on shared SAN disks to revoke the isolated node's reservation keys so the storage array rejects its I/O at the hardware layer.

```text
failover(standby):
  require quorum_majority_or_witness()
  fence_and_confirm_dead(old_primary)   // IPMI / PDU / SCSI-3 revoke
  promote(standby)
```

## Pitfalls

- **Running a two-node HA pair without a witness or fencing.** When a single interconnect drops, both nodes see 1 of 2 votes; promoting without external arbitration or STONITH turns every network hiccup into split brain.
- **Assuming quorum alone eliminates zombie writes.** Quorum decides which partition is allowed to lead, but a node stalled in a kernel freeze or long pause can still flush in-flight I/O to shared storage unless hardware or storage fencing cuts it off.
- **Skipping failover and fencing drills.** Misconfigured IPMI credentials, unreachable PDUs, or untested SCSI reservation paths fail silently until a real outage blocks promotion or permits dual primaries.
- **Sharing one network path for both heartbeats and heavy client traffic.** Congestion on a single link drops heartbeat packets and triggers false-positive failovers.

## Further reading

- [Split-brain (computing) — Wikipedia](https://en.wikipedia.org/wiki/Split-brain_(computing))
