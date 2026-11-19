## Why it exists

Forcing complex business validation and high-volume reporting screens through a single database schema creates contention and clumsy compromises—and updating rows in place erases how the system reached its current state. Pairing **Command Query Responsibility Segregation (CQRS)** with **Event Sourcing** splits write commands from read models and records every state change as an immutable event log. Systems with asymmetric read/write loads, strict audit trails, or multiple query views use the combination to scale reads independently and rebuild derived state at will.

## How it works

CQRS, first described by Greg Young, uses one model to validate and apply updates and a separate model to serve queries. Event Sourcing ensures every change to domain state is persisted as an ordered sequence of immutable events rather than overwritten in place.

In **Step 1, "Client sends write command"**, the client sends `Deposit($50)` to the Command API, which enforces business invariants on the write model. In **Step 2, "Append immutable event"**, the handler appends `Deposited(50)` to the Event Store—a purely additive write that minimizes locking.

In **Step 3, "Projector updates read view asynchronously"**, the Projector consumes the event stream and eagerly derives the denormalized Read View (`balance=$50`, `v2`). This **eager read derivation** shifts join and aggregation work off the query path, trading immediate consistency for fast reads. In **Step 4, "Client queries optimized read model"**, the Query API serves `GetBalance` directly from the precomputed Read View without replaying the event stream.

## What goes wrong

Because derived read models are updated asynchronously, a bug in projection code—or a new UI requirement—can leave the Read View corrupt or outdated. In the **Rebuilding a corrupted or new projection** branch, **Step 4, "Read view is corrupted or schema changes"** marks the Read View invalid. Because the Event Store holds the complete source of truth, the Read View is disposable.

In **Step 5, "Drop view and reset projector offset"**, operators wipe the corrupted view and rewind the Projector to offset `0`. In **Step 6, "Replay full event log to rebuild"**, replaying `Opened` and `Deposited(50)` in order reconstructs the exact `$50` state with zero data loss. Event Sourcing enables three capabilities from this same log: **complete rebuilds**, **temporal queries** (state at any past timestamp), and **event replay** to recover from defects or out-of-order asynchronous messages.

## In practice

Accounting ledgers—where accounting entries form an immutable log of every balance change—and version control systems (such as Subversion's dump-and-restore rebuilds) are natural examples of Event Sourcing. Read-heavy services route writes to a small write cluster that appends events and broadcasts them to horizontally scaled read replicas holding in-memory or denormalized views.

Replaying an entire log from offset `0` becomes slow as history grows, so production systems take periodic snapshots in parallel without downtime and replay only events recorded after the latest snapshot:

```text
rebuild(aggregate):
  state, offset = load_latest_snapshot(aggregate)
  for event in event_store.read_from(aggregate, offset):
    state = apply(state, event)
  return state
```

Teams also replay production event logs into test environments to debug issues step by step or validate upgrades before release.

## Pitfalls

- **Applying CQRS to straightforward CRUD applications.** Both Greg Young and Martin Fowler caution that for most systems, splitting read and write models adds synchronization overhead, eventual consistency bugs, and accidental complexity without enough benefit.
- **Re-triggering external side effects during replay.** External systems cannot distinguish a replay from a live event; outbound gateways must detect replay mode and suppress notifications, while external queries (such as a historical exchange rate) must either query by date or cache original responses.
- **Overlooking business rules that changed over time.** Replaying old events through updated logic can alter historical outcomes; date-dependent rules must live explicitly in the domain model as temporal logic rather than being overwritten.
- **Assuming read replicas stay strictly synchronized.** Asynchronous event propagation means readers can temporarily lag behind the write model and even disagree with one another until all projectors catch up.

## Further reading

- [CQRS — Martin Fowler](https://martinfowler.com/bliki/CQRS.html)
- [Event Sourcing — Martin Fowler](https://martinfowler.com/eaaDev/EventSourcing.html)
