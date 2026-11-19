## Why it exists

Every microservice needs mutual TLS (mTLS), service identity, load balancing, retries, circuit breaking, and telemetry, yet embedding those libraries into every service means maintaining and upgrading them across every programming language in the fleet. A **sidecar service mesh** splits networking out of application code into two planes: a **data plane** of co-located proxies (such as Envoy) alongside each workload that mediate all inbound and outbound traffic, and a **control plane** (such as Istio's `istiod`) that distributes certificates and routing policy at runtime. Teams gain uniform security, observability, and traffic control without rewriting application code.

## How it works

Each pod pairs an application container with a sidecar proxy that intercepts all network traffic entering and leaving the pod.

In **Step 1, "Control plane pushes certs and policy"**, the control plane acts as a Certificate Authority (CA), issuing short-lived **SPIFFE** (Secure Production Identity Framework for Everyone) X.509 workload certificates whose Subject Alternative Name encodes the service identity (such as namespace and service account), while translating high-level traffic rules into proxy configurations pushed to Sidecar A and Sidecar B.

In **Step 2, "Sidecars wrap plain traffic in mTLS"**, Orders App sends a plain HTTP `/charge` request over localhost. Sidecar A intercepts the call, opens a **mutual TLS** connection to Sidecar B, verifies both workload identities against their SPIFFE certificates, records telemetry, and hands the request to Sidecar B, which forwards plain HTTP locally to Payments App. Policy enforcement relies on cryptographic service identity rather than ephemeral IP addresses.

## What goes wrong

Because sidecar proxies add their own transparent retry logic on top of existing client SDKs, uncoordinated configurations can multiply traffic during slowdowns. In the **Misconfigured retries amplify into a storm** branch, **Step 3, "Payments App degrades and times out"** shows Payments App stalling past its 500ms timeout and returning `504 Timeout`.

In **Step 4, "Layered retries flood Payments"**, Orders App retries 3 times in its HTTP client while Sidecar A also retries 3 times per attempt—turning a single failing call into **9x traffic**. That **retry storm** keeps Payments pinned in overload and prevents recovery.

In **Step 5, "Retry budget stops the amplification"**, operators disable duplicate application-level retries and apply a **retry budget** (for example, capping concurrent retries at 20% of active and pending requests) so Sidecar A sheds excess retries while Payments recovers.

## In practice

In **Istio**, `istiod` serves as the control plane (service discovery, configuration conversion, and CA) while extended **Envoy** proxies written in C++ form the sidecar data plane, handling HTTP/2, gRPC, WebSocket, and TCP routing, TLS termination, staged rollouts, fault injection, and WebAssembly extensions.

Operators define per-route retries in an Istio `VirtualService` (`attempts`, `perTryTimeout`, `retryOn`) and cap concurrent retry load in a `DestinationRule` using Envoy's `retryBudget` (defaults: `percent: 20`, `minRetryConcurrency: 3`):

```yaml
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: payments-destination
spec:
  host: payments.prod.svc.cluster.local
  trafficPolicy:
    connectionPool:
      http:
        retryBudget:
          percent: 20
          minRetryConcurrency: 3
```

## Pitfalls

- **Enabling retries in both the app SDK and the sidecar proxy.** Stacking retries across layers multiplies failure traffic geometrically; pick one layer (either the mesh or the client) and fail fast at the other.
- **Setting `perTryTimeout` without checking the overall request timeout or deadline.** Uncoordinated per-try and overall timeouts either abort healthy retries too early or keep proxies retrying after the caller already gave up.
- **Ignoring sidecar resource and latency overhead.** Every pod runs an extra proxy container that consumes CPU and memory and adds two localhost proxy hops on every RPC.
- **Retrying non-idempotent requests blindly in the mesh.** Transparent sidecar retries on `5xx` or timeouts can duplicate mutations if the upstream endpoint is not idempotent.

## Further reading

- [Istio Documentation — Architecture](https://istio.io/latest/docs/ops/deployment/architecture/)
