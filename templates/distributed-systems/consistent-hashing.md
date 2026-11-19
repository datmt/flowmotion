## Why it exists

Partitioning keys across `N` servers with `hash(key) % N` breaks down as soon as a server joins or fails: changing `N` remaps nearly every key, triggering mass cache misses or terabytes of data movement. **Consistent hashing**—introduced in 1997 by David Karger and colleagues at MIT—places both keys and servers on the same circular hash ring so adding or removing a node remaps only `K/n` keys on average across `K` keys and `n` servers. Distributed caches, CDNs, and partitioned databases rely on it to resize clusters without reshuffling the whole keyspace.

## How it works

Both servers and keys hash onto the same circular space (`0..359` degrees in the animation). In **Step 1, "Keys walk clockwise to next node"**, each key maps to the first node encountered moving clockwise from its hash position: `k30` routes to Node B (120 deg), `k150` and `k200` route to Node C (240 deg), and `k300` wraps past 359 to Node A (0 deg). In code, clients keep the ring positions in a sorted array or balanced binary search tree and binary-search for the clockwise successor in `O(log N)` time.

In **Step 2, "Node D joins at 180 deg"**, the new server splits only Node C's arc `(120, 240]`. Only `k150` migrates from Node C to Node D; `k30`, `k200`, and `k300` never move. In **Step 3, "Node B fails and leaves"**, Node B's arc `(0, 120]` hands off to the next live clockwise neighbor—Node D—so only `k30` moves while Nodes A and C stay untouched.

## What goes wrong

Placing each physical server at a single point on the ring creates high variance: pseudo-random hash positions can cluster together and leave another server owning a huge gap. In the **Hot node solved with virtual nodes** branch, **Step 2, "Uneven placement creates a hot node"** shows Node C holding 60% of the load while Node A holds only 15%. Worse, if a single-position node dies, its entire contiguous arc lands on one clockwise neighbor at once.

In **Step 3, "Virtual nodes balance the ring"**, each physical server registers multiple **virtual nodes** (for example, `A#1..A#100`) scattered around the ring. Breaking the ring into many small arcs flattens load variance across servers, lets operators weight heterogeneous hardware by assigning more virtual nodes to larger machines, and spreads a failed node's keys across all surviving servers.

## In practice

Consistent hashing powers major production storage and caching systems:

- **Akamai** used consistent hashing early on to distribute web content across rotating CDN edge servers.
- **Amazon Dynamo** (2007) and **Apache Cassandra** use a consistent hash token ring with virtual nodes to partition and replicate rows without a central routing master.
- **Memcached** clients implement client-side sharding with libraries such as `libketama`, hashing each server to many ring points (commonly 100 to 250 virtual nodes per server) so uncoordinated cache servers preserve hit rates when a node drops.

```text
ring = sorted([(hash(f"{node}#{i}"), node) for node in nodes for i in range(vnodes)])
owner(key) = first entry in ring with pos >= hash(key), wrapping to ring[0]
```

Where extreme traffic spikes can still overwhelm one owner even with virtual nodes, **consistent hashing with bounded loads** (Mirrokni et al.) caps per-server capacity and overflows excess requests to the next clockwise node on the ring.

## Pitfalls

- **Using one ring position per physical server.** Without virtual nodes, small clusters suffer severe load skew, and a single node failure dumps its entire workload onto one neighbor.
- **Expecting virtual nodes to cure hot keys.** Virtual nodes balance the count of keys per server, not skewed access to a single viral key; hot keys still need caching, replication, or bounded-load routing.
- **Letting clients disagree on cluster membership.** In coordinator-free setups like Memcached, two clients with slightly different server lists hash the same key to different nodes, causing unnecessary misses or split state.
- **Over-provisioning virtual nodes blindly.** Very high virtual-node counts grow the routing table and metadata size that every router or client must store and search.

## Further reading

- [Consistent hashing — Wikipedia](https://en.wikipedia.org/wiki/Consistent_hashing)
