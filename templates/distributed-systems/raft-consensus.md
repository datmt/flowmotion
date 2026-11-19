## Why it exists

Keeping replicated state machines identical across servers that crash and networks that partition requires consensus—yet traditional Paxos proved notoriously hard to understand and implement cleanly. **Raft**, designed by Diego Ongaro and John Ousterhout (2014), decomposes consensus into three clearer subproblems—leader election, log replication, and safety—so at most one leader drives log updates per term and committed entries survive crashes and partitions. Consensus-backed stores and coordination systems rely on Raft whenever strong consistency and automatic failover are mandatory.

## How it works

Every server is a `Follower`, `Candidate`, or `Leader` in a monotonically increasing logical **term**. In **Step 1, "Everyone starts as a follower"**, all five servers start in term `0` with randomized election timeouts (typically 150–300ms) so split votes stay rare.

In **Step 2, "S1's timer fires first"** and **Step 3, "S1 asks for votes"**, S1 increments its term to `1`, votes for itself, and sends `RequestVote` to every peer. In **Step 4, "Followers grant their votes"** and **Step 5, "A majority makes S1 leader"**, followers adopt term `1` and grant at most one vote per term; collecting 3 of 5 votes elects S1 because no two candidates can hold disjoint majorities in the same term. In **Step 6, "Heartbeats suppress new elections"**, S1 sends periodic empty `AppendEntries` heartbeats so followers reset their election timers.

For writes, **Step 7, "A client writes x=5"** appends uncommitted `1:x=5` to S1's log. **Step 8, "What a follower checks"** shows `AppendEntries`'s consistency check (`PrevIdx`, `PrevTerm`), which enforces the **Log Matching Property**: if two logs share an index and term, they are identical up through that index. After **Step 9, "Replication reaches S2 first"** and **Step 10, "The rest catch up"**, **Step 11, "Quorum acknowledges"** reaches 4 of 5 servers—a majority—committing `1:x=5`. In **Step 12, "Commit and reply"**, S1 applies `x=5`, answers `OK`, and propagates the commit index on the next heartbeat.

## What goes wrong

The flow walks two failure branches:

- **Leader crash mid-replication (`What if the leader crashes mid-replication?`):** After **Step 10, "S1 crashes"** while only S1 and S2 hold uncommitted `1:x=5`, **Step 11, "S3 times out"** starts term `2`. In **Step 12, "S2 denies the vote"**, S2 refuses because its log is more up to date than S3's (protecting Leader Completeness), yet **Step 13, "S3 still wins with 3 of 5"** succeeds via S3, S4, and S5 because `1:x=5` was never committed. When **Step 14, "Client retries on the new leader"** writes `2:x=5`, **Step 15, "S2's stale entry is overwritten"** truncates S2's uncommitted term-1 entry and replaces it, **Step 16, "Committed under the new leader"** commits it, and **Step 17, "S1 rejoins as a follower"** brings S1 back in sync.
- **Network partition (`What if the network partitions?`):** In **Step 13, "The cluster splits 2 / 3"**, `{S1, S2}` separates from `{S3, S4, S5}`. In **Step 14, "The minority accepts a write it cannot commit"**, S1 stores `1:y=9` on 2 of 5 servers—never a majority, so it never commits or replies. Meanwhile **Step 15, "The majority elects its own leader"** and **Step 16, "The majority keeps making progress"** elect S3 in term `2` and commit `2:z=1`. When **Step 17, "The partition heals"** delivers S3's term-2 heartbeat, **Step 18, "The old leader steps down"** drops S1 to follower and replaces uncommitted `1:y=9` with `2:z=1`.

## In practice

Raft's availability depends on one core timing inequality from Section 5.6 of the paper:

```text
broadcastTime << electionTimeout << MTBF
```

Typically `broadcastTime` is 0.5–20ms, randomized `electionTimeout` is 150–300ms (with heartbeats sent far more frequently than `electionTimeout`), and server mean time between failures (`MTBF`) is months or longer.

For linearizable client interaction (Section 8):

- Clients attach unique serial numbers to commands so retries after a leader crash (**Step 14, "Client retries on the new leader"**) are deduplicated rather than applied twice.
- Each newly elected leader commits a blank `no-op` entry in its current term to learn which earlier entries are committed, and exchanges heartbeats with a majority before answering read-only requests so a deposed leader cannot serve stale data.

## Pitfalls

- **Committing entries from a previous term directly by counting replicas.** Raft forbids committing old-term entries purely by replica count; a leader must commit a current-term entry (such as a startup `no-op`) to commit prior entries indirectly via Log Matching.
- **Serving local reads from a leader without a quorum check.** A partitioned leader like S1 in **Step 13** still believes it leads until heartbeats return; answering reads locally without checking a majority violates linearizability.
- **Setting `electionTimeout` too close to `broadcastTime`.** If heartbeats cannot reliably arrive before follower timers expire, servers trigger nonstop elections and stall progress.
- **Forgetting client command deduplication.** If a leader crashes after committing a command but before replying to the client, retrying without a unique request ID executes the command twice.

## Further reading

- [In Search of an Understandable Consensus Algorithm — Diego Ongaro and John Ousterhout (USENIX ATC 2014)](https://raft.github.io/raft.pdf)
