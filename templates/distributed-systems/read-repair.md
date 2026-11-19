## Why it exists

Replicas in leaderless databases drift apart whenever a node temporarily goes offline, drops a write, or misses part of a failed quorum update. **Read repair** uses ordinary multi-replica reads to spot that divergence and overwrite stale replicas with the latest version, healing hot keys continuously without waiting for a full-cluster scan. Apache Cassandra also relies on blocking read repair to preserve **monotonic quorum reads**, preventing a partially applied write from appearing on one quorum read and vanishing on the next.

## How it works

When a read runs at a consistency level above `ONE` (such as `TWO`, `THREE`, `QUORUM`, or `LOCAL_QUORUM`), the coordinator checks multiple replicas before answering the client.

In **Step 1, "Coordinator reads data and digests"**, the client sends `GET k` and the coordinator routes a direct full-data read to the fastest replica (R1, chosen via Cassandra's dynamic snitch) while sending lightweight **digest** requests to the remaining replicas needed for the consistency level (R2 and R3). Digest requests return only a hash of the row so replicas do not waste network bandwidth sending duplicate payloads when they already agree.

In **Step 2, "Digest mismatch exposes divergence"**, the coordinator hashes R1's payload (`v2@t5`) and compares it against R2's and R3's digests. R2 matches, while R3 returns `hash(v1)!` because it missed an earlier write. Seeing the mismatch, the coordinator issues full data reads to the digest replicas so it can inspect cell timestamps and merge an up-to-date result.

In **Step 3, "Return latest value and repair R3"**, the coordinator selects `v2@t5` (the newest timestamp), writes the repair mutation to stale R3, and returns `v2@t5` to the client. In Cassandra's default **blocking** mode, the coordinator waits until repair writes satisfy the read consistency level before replying, guaranteeing that any later quorum read will see at least `v2@t5` even if the original write had only reached a minority of nodes.

## What goes wrong

Read repair only heals data that clients actually read and only touches the replicas contacted by that query. In the **Unread keys stay divergent without anti-entropy** branch, **Step 3, "Cold key k-archive is never queried"** shows a key that receives no read traffic, leaving R3 silently stuck on stale `v1@t2` indefinitely.

In **Step 4, "Background anti-entropy is still required"**, relying on read repair alone leaves cold partitions unprotected if the up-to-date replicas later fail or lose storage. Apache Cassandra explicitly warns that read repair is not a replacement for scheduled full repairs (such as Merkle-tree anti-entropy sweeps) or replacing failing nodes.

## In practice

Apache Cassandra 4.0 introduced the table-level `read_repair` schema option (CASSANDRA-14635) with two modes: `BLOCKING` (the default, ensuring monotonic quorum reads) and `NONE` (reconciles for the current response without sending repair writes, preserving partition-level write atomicity).

```sql
CREATE TABLE ks.tbl (
  k INT,
  c INT,
  v INT,
  PRIMARY KEY (k, c)
) WITH read_repair = 'NONE';
```

In Cassandra 3.x, probabilistic background read repair was configured via `read_repair_chance` (often `0.2`, or `0` on `DateTieredCompactionStrategy` tables) and `dclocal_read_repair_chance`; Cassandra 4.0 removed both settings (CASSANDRA-13910). Cassandra 4.0 also added speculative retry for full data reads and repair mutations (CASSANDRA-10726) so a slow replica does not stall blocking repair.

## Pitfalls

- **Expecting read repair at `ONE` or `LOCAL_ONE`.** When a read contacts only a single replica, no digest comparison occurs and no read repair runs.
- **Assuming read repair fixes every replica in the cluster.** A `QUORUM` read only compares and repairs the replicas involved in that query; untouched replicas can remain stale.
- **Breaking partition-level write atomicity under `BLOCKING` mode.** Because read repair only repairs the columns or rows selected by the query, reading a single clustering row from a multi-row partition batch can propagate a partial write; use `read_repair = 'NONE'` when write atomicity matters more than monotonic quorum reads.
- **Skipping scheduled full anti-entropy repairs.** Unread keys never trigger read repair, so clusters still need periodic full repair to converge cold data.

## Further reading

- [DataStax Apache Cassandra 3.0 Documentation — Read Repair: repair during read path](https://docs.datastax.com/en/cassandra-oss/3.0/cassandra/operations/opsRepairNodesReadRepair.html)
- [Apache Cassandra Documentation — Read repair](https://cassandra.apache.org/doc/latest/cassandra/managing/operating/read_repair.html)
