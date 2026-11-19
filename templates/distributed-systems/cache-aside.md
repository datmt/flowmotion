## Why it exists

Repeatedly querying a database for slowly changing data wastes throughput and adds latency, yet many caches do not natively fetch from or write back to a database on their own. With **cache-aside**, the application checks the cache first, loads missing entries from the database on demand, and removes stale entries after writes. It suits read-heavy services with unpredictable access patterns that can tolerate brief staleness.

## How it works

Because the cache sits beside the database instead of talking to it directly, the application coordinates every miss and invalidation. In **Step 1, "Read checks cache first and misses"**, the App Service looks up `user:7` in the cache and gets a miss.

In **Step 2, "Fetch from DB and populate cache"**, the app queries the database for `Alice v1`, writes the non-null result into the cache with a time-to-live (TTL) expiration, and returns it to the client. In **Step 3, "Next read hits cache directly"**, subsequent reads find `user:7` in cache and return immediately without touching the database.

On updates, the application writes the new value to the database first and then deletes the key from the cache so the next read lazily reloads the fresh copy. Updating the store before deleting the cache prevents a race where a concurrent reader misses, fetches the pre-update row from the database, and writes that outdated value back into the cache.

## What goes wrong

Cache-aside does not guarantee strict consistency between cache and database. In the **Stale read when DB changes without invalidation** branch, **Step 4, "Database updates to Alice v2"** advances the database while the cache entry stays untouched—for instance, because an external process modified the database directly, or the cache delete failed or was delayed.

In **Step 5, "Client reads stale value from cache"**, the next reader hits the cache and receives outdated `Alice v1`. Even when delete-on-write runs normally, a narrow window between the database update and cache deletion (or asynchronous replication across data stores) can expose stale data. A bounded TTL ensures orphaned entries eventually expire and reload from the database.

## In practice

Shared distributed caches such as Redis (for example, Azure Managed Redis accessed via a shared `ConnectionMultiplexer` in `StackExchange.Redis`) let multiple application instances share one warm cache rather than maintaining diverging copies.

```text
read(key):
  val = cache.get(key)
  if val is null:
    val = db.get(key)
    if val is not null:
      cache.set(key, val, ttl=5m)
  return val

write(key, val):
  db.update(key, val)
  cache.delete(key)
```

Teams tune three main knobs to match access patterns:

- **Expiration policy (TTL):** Too short forces constant database reloads; too long extends staleness (the Azure reference implementation uses a 5-minute default, adjusted per item by staleness sensitivity).
- **Eviction policy:** Caches hold far less data than primary stores and typically evict least-recently-used (LRU) entries; per-item policies can keep expensive-to-fetch entries cached longer.
- **Startup priming:** Applications can preload predictable hot records on startup and let cache-aside refill anything that later expires or gets evicted.

## Pitfalls

- **Invalidating the cache before updating the database.** A reader arriving between the delete and the database write misses the cache, reads the old value, and repopulates the cache with stale data.
- **Relying on private in-memory caches across multiple instances.** Separate per-instance caches drift out of sync quickly unless expired aggressively; use a shared distributed cache when multiple instances serve the same keys.
- **Caching sensitive records or low-hit-rate keys.** Security-sensitive data should be fetched from the primary store rather than placed in a shared cache, and workloads where most requests miss pay extra lookup overhead with no gain.
- **Using cache-aside for strict read-after-write freshness or purely static datasets.** When readers must see updates immediately after a write, consider write-through caching; when a small static dataset fits in memory, prime it at startup without expiration; avoid web-farm session caching designs that force client-server affinity.

## Further reading

- [Cache-Aside pattern — Azure Architecture Center (Microsoft Learn)](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside)
