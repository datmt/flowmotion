## Why it exists

When microservices follow the Database per Service pattern, a single business workflow such as order checkout spans multiple independent databases where a local ACID transaction cannot run and two-phase commit (2PC) is rarely viable. The **Saga pattern**—introduced for long-lived database transactions by Hector Garcia-Molina and Kenneth Salem (1987) and adapted for microservices—maintains cross-service consistency as a reliably coordinated sequence of local transactions. If a later step violates a business rule, the saga undoes earlier committed steps by executing explicit **compensating transactions**.

## How it works

Each participant commits its own local database transaction immediately and communicates with the rest of the workflow over asynchronous messages or commands. The animation shows an **orchestration-based saga**, where a central **Order Saga** orchestrator tells each participant what to execute next (the alternative is **choreography**, where each service emits domain events that trigger the next service directly).

In **Step 1, "Checkout"**, the client sends `PlaceOrder` and the Order Saga orchestrator takes ownership of the workflow, typically persisting the order in a `PENDING` state.

In **Step 2, "Charge card"**, the orchestrator sends a `Charge` command to the Payment service. Payment executes a local ACID transaction against its own database and commits immediately, releasing database locks rather than holding them open for the entire checkout.

In **Step 3, "Reserve stock"**, the orchestrator sends `Reserve` to Inventory. Inventory commits its local stock reservation and replies; with all local transactions committed, the Order Saga marks the order complete.

## What goes wrong

Because each local transaction commits right away, a failure later in the sequence cannot use a database rollback. In the **What if inventory fails?** branch, **Step 3, "Reservation fails"** occurs after Payment has already committed the card charge: Inventory is out of stock and returns `OutOfStock` to the orchestrator.

In **Step 4, "Compensate"**, the orchestrator cannot erase the committed charge from Payment's database. Instead, it runs **compensating transactions** in reverse order—sending `Refund` to Payment as a brand-new local transaction that semantically reverses the earlier charge.

Because intermediate commits are immediately visible to other requests, sagas sacrifice the **I** (isolation) of ACID. Concurrent transactions can read uncommitted-looking business state (dirty reads) or overwrite each other's updates (lost updates) unless the application adds isolation countermeasures.

## In practice

Chris Richardson's microservices saga design pairs orchestration (using frameworks such as Eventuate Tram Sagas or workflow engines) with two operational building blocks:

1. **Reliable state-and-message publication.** A participant cannot use a distributed transaction spanning its database and message broker, so it updates its database and emits commands or events atomically using the **Transactional Outbox** pattern or **Event Sourcing**.
2. **Isolation countermeasures and step classification.** Services apply **semantic locks** (such as marking an order `PENDING` until the saga finishes) and structure workflows into **compensatable transactions** (reversible before the decision point), a **pivot transaction** (the go/no-go boundary), and **retriable transactions** (steps after the pivot that retry idempotently until they succeed).

```text
Order Saga state flow:
  1. Create Order (PENDING)  [compensatable -> Reject Order]
  2. Charge Payment          [compensatable -> Refund Payment]
  3. Reserve Inventory       [pivot: if OutOfStock, run compensations in reverse]
  4. Approve Order           [retriable, idempotent]
```

When a synchronous client starts an asynchronous saga (for example, `POST /orders`), the API either holds the response until completion, returns an `orderID` for polling (`GET /orders/{orderID}`), or pushes completion via a webhook or WebSocket.

## Pitfalls

- **Treating compensations as optional or non-idempotent.** Network retries can deliver a `Refund` or `Reserve` command more than once, and compensating steps themselves must retry until they succeed.
- **Ignoring the lack of ACID isolation.** Without countermeasures such as semantic locks (`PENDING` states), concurrent sagas can observe intermediate charges or modify records mid-flight, causing dirty reads or lost updates.
- **Updating a database and publishing a saga message in two separate calls.** Crashing between the database commit and broker publish leaves the saga stuck forever; use a transactional outbox or event sourcing.
- **Putting an uncompensatable side effect before the pivot.** Actions that cannot be undone (such as shipping a physical package or sending an external notification) belong after the pivot transaction as retriable steps.

## Further reading

- [Microservices.io — Pattern: Saga (Chris Richardson)](https://microservices.io/patterns/data/saga.html)
