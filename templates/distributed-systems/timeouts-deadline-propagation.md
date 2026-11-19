## Why it exists

Every RPC waiting on a slow backend ties up threads, connections, and memory on the caller, yet when each tier in a service tree invents its own independent timeout, deep backends keep grinding away on requests long after the user has already given up. **Deadline propagation**—documented in Google's Site Reliability Engineering book—attaches a single end-to-end deadline at the top of the call stack and passes the shrinking time budget down every RPC hop. Downstream services check the remaining budget before starting work and cancel expired queries immediately, preventing abandoned work from triggering a cascading outage.

## How it works

Instead of configuring isolated per-hop timeouts, the edge service sets one absolute deadline for the entire request tree, and every hop subtracts its elapsed processing time before calling downstream dependencies.

In **Step 1, "Client sets an end-to-end 500ms deadline"**, the client sends `GET /order` with a 500ms budget. API Gateway spends 50ms authenticating and routing the call, then forwards `deadline: 450ms` to Orders Service.

In **Step 2, "Orders forwards shrinking budget to Inventory"**, Orders spends 350ms on earlier work, leaving `100ms` for Inventory Service. Inventory receives the 100ms budget and passes that same cap to Inventory DB rather than allowing a multi-second query.

In **Step 3, "Deadline expires: DB query cancels immediately"**, once total elapsed time reaches 500ms, the remaining budget hits `0ms`. Inventory aborts the slow database query right away and frees its worker thread while API Gateway returns `504 Deadline Exceeded` to the client—doing zero wasted work after the caller has stopped listening.

## What goes wrong

Without deadline propagation, each layer picks a generous local timeout in isolation. In the **Independent timeouts cause zombie work and cascade** branch, **Step 2, "Each hop uses its own hardcoded 5s timeout"** replaces the shrinking budget with local 5-second timeouts at Orders and Inventory, even though the client will still abandon the request at 500ms.

In **Step 3, "Client times out and retries while zombies run"**, the client gets `504` at 500ms and sends `RETRY #2`, while Inventory and Inventory DB stay locked on the abandoned **zombie query** for another 4.5 seconds. As Google's SRE book puts it, "you don't get credit for late assignments with RPCs": retries stack on top of zombie requests, saturating database connections and thread pools until the entire service collapses.

Overly long timeouts also amplify **bimodal latency**: in the SRE book's worked example, a fleet serving 1,000 QPS at 100ms across 1,000 threads normally uses only 100 threads, yet if just 5% of requests stall against a 100-second deadline (requiring 5,000 threads), thread exhaustion turns a 5% backend error into an **80.4% error rate**.

## In practice

In **gRPC**, callers attach a timeout or deadline to a request context and transmit remaining time on the wire via the `grpc-timeout` HTTP/2 header (avoiding cross-host clock skew). Servers propagate the deadline by deriving child contexts from the incoming `ctx`—never `context.Background()`—and optionally capping non-critical sub-calls with a tighter upper bound:

```go
func (s *OrdersServer) GetOrder(ctx context.Context, req *pb.OrderReq) (*pb.OrderResp, error) {
    // Inherits the caller's remaining deadline; caps this hop at 200ms if more time remains
    invCtx, cancel := context.WithTimeout(ctx, 200*time.Millisecond)
    defer cancel()
    return s.inventoryClient.CheckStock(invCtx, &pb.StockReq{Id: req.Id})
}
```

Google SRE recommends checking remaining deadline before each expensive processing stage, trimming outgoing deadlines slightly to leave room for network transit and post-processing, pairing deadline propagation with **cancellation propagation** (so hedged requests or fatal upstream errors abort doomed sibling calls immediately), and using LIFO or CoDel queues under overload so stale queued requests are dropped before execution.

## Pitfalls

- **Dropping the incoming context with `context.Background()`.** Creating a fresh context for downstream RPCs silently resets the deadline and reintroduces zombie work.
- **Leaving RPC clients with no default timeout.** Frameworks such as gRPC default to no deadline unless configured, allowing a single hung backend to leak threads until process restart.
- **Setting deadlines orders of magnitude above normal latency.** A 60-second or 100-second timeout on a 100ms service lets a small fraction of stalled calls exhaust the entire thread pool under bimodal latency.
- **Skipping deadline checks between stages or across database drivers.** Propagating a deadline to a service does not save database capacity if the service fails to pass the remaining timeout into the SQL query context.

## Further reading

- [Google SRE Book — Chapter 22: Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/)
