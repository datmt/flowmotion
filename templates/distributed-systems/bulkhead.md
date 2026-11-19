## Why it exists

When a service shares one thread or connection pool across multiple downstream dependencies, a single unresponsive dependency ties up every slot and blocks calls to healthy services too. Partitioning resources into isolated pools—the **bulkhead** pattern, also known as a cell-based architecture—limits a failure to the pool assigned to the affected dependency so the rest of the application keeps running. Named after the watertight compartments in a ship's hull, bulkheads protect both multi-dependency consumers and multi-tenant services from cascading failures.

## How it works

The pattern segments either consumer-side resources (one pool per downstream service) or service-side instances (separate groups of instances per consumer workload or priority tier). In **Step 1, "Traffic flows through dedicated pools"**, the API Gateway routes checkout traffic through the Payments Pool and browsing traffic through the Catalog Pool, each bounded to 4 slots.

Because the two pools share no threads or connections, capacity for Catalog does not depend on how fast Payments responds. Partitioning also lets teams offer distinct quality-of-service tiers—for instance, giving high-priority consumers a dedicated pool backed by dedicated service instances—and keeps security incidents constrained to a single compromised compartment.

## What goes wrong

In the **Slow Payments saturates its pool only** branch, the Payments API stalls for 30 seconds per call. In **Step 2, "Payments API slows to a crawl"**, four in-flight checkout requests occupy every slot in the Payments Pool. Because resources held by slow requests stay unavailable until the call returns or times out, a shared pool would drain completely and starve unrelated endpoints.

In **Step 3, "Extra Payments calls fast-fail"**, a fifth checkout request finds the Payments Pool full and returns `503` immediately instead of queuing unbounded work. Meanwhile, **Step 4, "Catalog traffic stays completely healthy"** shows browsing traffic continuing through the untouched Catalog Pool with normal latency. The fault stays inside the Payments compartment rather than taking down the entire gateway.

## In practice

Consumer-side bulkheads use processes, thread pools, or semaphores; libraries such as **Resilience4j** (Java) and **Polly** (.NET) provide ready-made implementations. Asynchronous services achieve the same isolation with separate message queues drained by dedicated worker pools.

Service-side bulkheads deploy partitions into separate virtual machines, containers, or processes—containers offer strong resource isolation with low overhead. In Kubernetes, per-container CPU and memory requests and limits enforce a hardware bulkhead at the pod boundary:

```yaml
resources:
  requests:
    memory: "64Mi"
    cpu: "250m"
  limits:
    memory: "128Mi"
    cpu: "1"
```

Cloud platforms expose built-in bulkheads too, including API gateway rate-limit policies, serverless concurrency limits, per-container database throughput isolation (such as Azure Cosmos DB request units), and dedicated AI model deployments per workload or tenant. Teams typically combine bulkheads with retries, circuit breakers, and throttling, align partition boundaries with domain-driven design bounded contexts, and monitor each partition's performance and SLA separately.

## Pitfalls

- **Accepting wasted idle capacity without checking the budget.** Dedicated pools cannot borrow unused slots from quiet neighbors, which makes resource usage less efficient; skip bulkheads when that inefficiency outweighs the isolation benefit.
- **Adding unnecessary complexity.** Partitioning adds cost, configuration, and per-compartment monitoring overhead that small or low-risk systems may not need.
- **Re-implementing platform controls in application code.** Hand-rolled throttling or isolation logic duplicates built-in container resource limits, API gateway policies, and database throughput quotas.
- **Choosing the wrong granularity.** Placing every tenant in its own partition multiplies operational overhead, while grouping too many workloads together leaves noisy neighbors able to affect each other.

## Further reading

- [Bulkhead pattern — Azure Architecture Center (Microsoft Learn)](https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead)
