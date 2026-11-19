## Why it exists

Caches accelerate reads by keeping hot data in fast memory, yet every write forces a trade-off between **write latency** and **durability**: waiting on the slower backing store slows down every update, whereas replying from volatile memory risks losing acknowledged writes on crash. **Write-through** and **write-back** (also called copy-back) are the two fundamental cache writing policies that navigate this trade-off across CPU caches, storage controllers, and distributed data caches. Picking the wrong policy either bottlenecks write-heavy workloads or silently drops committed user data during power loss.

## How it works

Under **write-through**, every write updates both the cache and the backing database synchronously before the caller receives an acknowledgement.

In **Step 1, "Client writes x=v1 to cache"**, the client sends `SET x=v1`, and the cache updates its in-memory copy of `x` to `v1`.

In **Step 2, "Cache writes synchronously to DB"**, the cache forwards `WRITE x=v1` to the database and waits for confirmation. Because every write hits the backing store, write latency includes the database round trip and write traffic is never coalesced.

In **Step 3, "Reply OK: cache and DB match"**, the cache replies `OK` only after the database confirms persistence. Cache and database remain consistent at every acknowledgement, so cache entries can be evicted or dropped instantly without flushing—and a cache crash one millisecond later loses nothing.

## What goes wrong

**Write-back** reverses the trade-off to minimize write latency and absorb bursty updates, deferring database writes until eviction or background flushing. In the **Write-back: fast reply, lost on crash** branch, **Step 2, "Write-back replies OK before DB flush"** sets a **dirty bit** on `x=v1` (marking it modified relative to storage) and returns `OK (fast!)` to the client immediately. Multiple rapid writes to `x` overwrite the same dirty entry in memory, turning many client writes into a single backing-store flush.

In **Step 3, "Cache crashes before background flush"**, power fails or the cache node restarts before the dirty entry is flushed. Volatile cache memory vanishes while the database still holds `v0`.

In **Step 4, "Acknowledged write is lost"**, the client already received `OK`, yet `x=v1` is permanently gone. Until a dirty block flushes, the database also holds stale data—meaning any reader bypassing the cache sees `v0`.

## In practice

Both policies appear across every layer of computing—from CPU L1/L2 caches and RAID storage controllers to OS page caches and application caching tiers—and are usually paired with a matching **write-miss policy** (what happens when a written key is not yet in cache):

```text
Write-hit policy  | Typical write-miss pairing         | Eviction cost
------------------+------------------------------------+----------------------------
Write-through     | No-write-allocate (write-around)   | Free (all entries clean)
Write-back        | Write-allocate (fetch, then dirty) | Flush dirty entries first
```

- **Write-through + no-write-allocate** avoids polluting cache space with write-once keys while keeping cache coherence simple.
- **Write-back + write-allocate** loads missed blocks into cache so repeated writes hit memory and coalesce before eviction. Storage arrays and database buffer pools make write-back durable by backing dirty memory with **battery-backed RAM (NVRAM)**, non-volatile write-ahead logs (WALs), or synchronous replication across nodes.

## Pitfalls

- **Using volatile write-back for irreplaceable data without replication or a WAL.** If the application promises durability upon `OK`, an un-replicated volatile write-back cache violates that contract on crash or power loss.
- **Letting other services read the backing database directly behind a write-back cache.** Because dirty updates live only in the cache until flushed, direct database readers observe stale values and break coherence.
- **Choosing write-through for hot counters or rapid repeated updates.** Writing every increment synchronously to disk or a relational database turns the backing store into a bottleneck that write-back coalescing would have absorbed.
- **Ignoring dirty-entry eviction latency under write-back.** When a write-back cache fills with dirty entries, evicting a block requires flushing it to storage first, causing tail-latency spikes if background flushing falls behind.

## Further reading

- [Wikipedia — Cache (computing): Writing policies](https://en.wikipedia.org/wiki/Cache_(computing)#Writing_policies)
