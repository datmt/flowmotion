## Why it exists

In virtualized and containerized deployments—such as autoscaling VM groups or container clusters—service instances scale up and down continuously and receive dynamic IP addresses, so callers cannot hardcode fixed hostnames or ports. **Client-side service discovery** solves this by registering live instances in a **service registry** and letting each caller query that registry to route directly to healthy endpoints. Eliminating a central load-balancer hop keeps the data path short while adapting automatically as instances come and go.

## How it works

The animation depicts **self-registration** paired with **client-side discovery**, where instances report their own availability and callers load-balance directly across discovered addresses.

In **Step 1, "Instances register and send heartbeats"**, Payments A (`10.0.1.1`) and Payments B (`10.0.1.2`) register their network locations with the **Service Registry** at startup and periodically send heartbeats (lease renewals) to prove they are still alive.

In **Step 2, "Caller queries registry for healthy endpoints"**, Order Service resolves the logical name `payments` against the registry, receives `[10.0.1.1, 10.0.1.2]`, and caches the list locally so it does not pay a registry lookup on every outbound request.

In **Step 3, "Caller sends request directly"**, Order Service applies its client-side load-balancing rule (for example, round-robin) and sends `POST /charge` directly to Payments A (`10.0.1.1`), receiving `200 OK` with no extra proxy hop in between.

## What goes wrong

Because health checks run on intervals and registries cache responses to stay fast, service discovery is always eventually consistent. In the **Stale registry entry causes failover** branch, **Step 4, "Payments B crashes before TTL expires"** shows an ungraceful crash: Payments B cannot deregister itself, so `10.0.1.2` remains listed as healthy until its lease expires on the registry and callers refresh their local caches.

In **Step 5, "Caller hits stale endpoint and fails"**, Order Service picks cached `10.0.1.2` and receives `ECONNREFUSED`. Even a highly available registry cannot eliminate this stale-cache window completely because failures happen asynchronously between heartbeats and cache refreshes.

In **Step 6, "Registry evicts B; caller retries on A"**, missed heartbeats cause the registry to drop `10.0.1.2`, while Order Service marks Payments B unhealthy locally and fails over to Payments A, masking the crash from the user.

## In practice

Client-side discovery is typically built into a microservice chassis framework—Chris Richardson's canonical example pairs **Netflix Eureka** (service registry) with **Spring Cloud** and **Ribbon** (`@EnableEurekaClient` and `@LoadBalanced` resolving logical URLs such as `http://PAYMENTS-SERVICE/charge`), while **HashiCorp Consul**, **ZooKeeper**, and **etcd** are common registries in other stacks.

Default Netflix Eureka lease and cache timers illustrate why callers must tolerate brief staleness:

```properties
eureka.instance.lease-renewal-interval-in-seconds=30
eureka.instance.lease-expiration-duration-in-seconds=90
eureka.server.responseCacheUpdateInvervalMs=30000
eureka.client.registryFetchIntervalSeconds=30
```

Eureka also enables **self-preservation mode** by default: if incoming heartbeats drop below 85% of the expected rate, the server freezes evictions rather than purging healthy instances during a network partition. Teams running polyglot fleets often prefer **server-side discovery** (such as an AWS ELB or Kubernetes Service/router querying the registry) or a sidecar proxy to avoid reimplementing registry clients in every programming language.

## Pitfalls

- **Treating the registry list as instantaneously accurate.** Callers will inevitably hit recently dead endpoints during the lease and cache-refresh window; pair discovery with timeouts, local health ejection, and safe (idempotent) retries.
- **Tuning heartbeat intervals without checking self-preservation math.** In Netflix Eureka, shrinking the default 30-second heartbeat interval can break the 85% self-preservation threshold calculation and cause unexpected eviction freezes.
- **Reimplementing client-side discovery across many languages.** Client-side discovery couples every caller to the registry protocol; polyglot teams often switch to server-side discovery or sidecars (as Netflix did with Prana for non-JVM services).
- **Skipping graceful deregistration on shutdown.** Letting instances exit without telling the registry forces callers to absorb errors until the full lease timeout expires during every deployment.

## Further reading

- [Microservices.io — Pattern: Client-side service discovery (Chris Richardson)](https://microservices.io/patterns/client-side-discovery.html)
- [Microservices.io — Pattern: Service registry (Chris Richardson)](https://microservices.io/patterns/servicediscovery/serviceregistry.html)
- [Microservices.io — Pattern: Self registration (Chris Richardson)](https://microservices.io/patterns/servicediscovery/selfregistration.html)
