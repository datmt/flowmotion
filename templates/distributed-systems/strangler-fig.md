## Why it exists

Big-bang rewrites of aging monoliths fail far more often than they succeed: replacing a complex production system takes years, users cannot wait that long for new features, undocumented legacy behavior is hard to specify upfront, and much of the old behavior is no longer wanted anyway. The **Strangler Fig** pattern—named by Martin Fowler after rainforest vines that gradually grow around and replace a host tree—modernizes legacy systems incrementally by introducing seams and routing traffic slice by slice to new services. Teams deliver value early, learn from real production traffic, and avoid betting the business on a single cutover date.

## How it works

Before replacing any feature, engineers insert a **seam**—typically an HTTP reverse proxy or API gateway acting as a **routing facade**—between clients and the monolith.

In **Step 1, "Facade proxies all traffic to Legacy"**, clients send both `/orders` and `/billing` through the Routing Facade, which initially forwards 100% of requests untouched to Legacy Monolith. This establishes the **transitional architecture** that lets the old and new systems coexist safely.

In **Step 2, "Shift /billing to the new service"**, once New Billing Service is built and verified, operators update the facade's route table to send only `/billing` to the new service while `/orders` continues running on Legacy. Production traffic proves the new slice in isolation without risking the rest of the application.

In **Step 3, "Eventually Legacy shrinks until retired"**, the team repeats the process for `/orders` and each remaining capability. As every route moves off the monolith, Legacy drops to zero traffic and can be decommissioned cleanly along with the transitional routing glue.

## What goes wrong

Even well-tested replacement services hit subtle production edge cases that were buried in years of legacy patches. In the **Bug in new service triggers instant rollback** branch, **Step 3, "New Billing Service fails in production"** shows a regression causing `500 Error` responses on `/billing` immediately after cutover.

In **Step 4, "Facade flips /billing back to Legacy in seconds"**, because the Legacy Monolith is still deployed and healthy behind the facade, operators revert the `/billing` route back to Legacy via configuration without rolling back binaries or waiting for a redeploy. Blast radius stays limited to one slice, and recovery takes seconds while engineers diagnose and fix the bug.

## In practice

In Fowler's framing—drawing on Ian Cartwright, Rob Horn, and James Lewis's legacy-displacement work—successful strangler fig migrations pair technical seams with four ongoing activities: aligning on business outcomes, breaking the monolith along clear business-capability seams, delivering slices incrementally, and adapting team structure and engineering practices (acknowledging **Conway's Law**) so the replacement does not recreate the same brittle architecture.

At the routing facade (for example, NGINX, Envoy, or an API gateway), each migration step is a small, reversible route change:

```nginx
location /billing {
  proxy_pass http://new-billing-service;
}
location /orders {
  proxy_pass http://legacy-monolith;
}
```

When data cannot be separated immediately, both services initially share the existing data store (as shown in the animation) or synchronize via change-data-capture or anti-corruption adapters until the legacy schema can also be decomposed.

## Pitfalls

- **Refusing to build transitional architecture.** Coexistence glue (facades, dual-compatible schemas, adapters) will eventually be deleted, which makes teams balk at writing it—yet skipping it forces risky all-or-nothing cutovers.
- **Migrating the hardest, most tangled slice first.** Starting with a peripheral or high-value, well-bounded capability builds seam-building skill and returns business value early.
- **Breaking backward compatibility in the shared data store before cutover is proven.** If New Billing writes rows Legacy cannot read, flipping the facade route back during a regression will still fail.
- **Replacing the code without changing the organization.** As Fowler emphasizes via Conway's Law, keeping the same siloed processes and release bottlenecks turns the new services into a distributed version of the old monolith.
- **Stopping halfway and maintaining two systems forever.** Without steady prioritization to finish retiring legacy slices, transitional architecture hardens into permanent complexity.

## Further reading

- [Martin Fowler — Strangler Fig](https://martinfowler.com/bliki/StranglerFigApplication.html)
