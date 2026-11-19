## Why it exists

Updating a database and publishing an event to a message broker in two separate operations creates a **dual-write** race: sending before commit can publish events for transactions that later roll back, while sending after commit loses events if the service crashes in between. Traditional two-phase commit (2PC) across a database and broker is rarely supported or desirable. The **Transactional Outbox** pattern stores outgoing messages in the same local database transaction as business state so a separate relay publishes them reliably without 2PC.

## How it works

In **Step 1, "Write order and outbox in one TX"**, the Order Service handles `CreateOrder` by inserting `#42` into `orders` and inserting `OrderCreated` (marked `pending`) into `outbox` inside a single local ACID transaction. Because both writes share one commit, the event is stored if and only if the order commits—and automatically vanishes if the transaction rolls back. Ordering is also preserved across concurrent service instances updating the same aggregate.

In **Step 2, "Relay reads unpublished rows"**, a separate Outbox Relay reads pending rows from `outbox`. In **Step 3, "Publish event to broker"**, the relay publishes `OrderCreated #42` to the Message Broker; even if the broker was temporarily down when the order committed, the row stays durable in the database until the broker recovers.

In **Step 4, "Mark outbox row sent"**, once the broker acknowledges delivery, the relay updates row `#42` to `sent` (or deletes it) so it is not picked up again.

## What goes wrong

Moving publishing into a background relay removes data loss, yet the boundary between broker and database still cannot be atomic. In the **Relay crashes before marking sent** branch, **Step 4, "Relay dies after broker publish"** crashes the relay right after the broker accepts `OrderCreated #42` and before the database records `sent=true`.

In **Step 5, "Restarted relay publishes a duplicate"**, the restarted relay sees row `#42` is still `pending` and publishes `OrderCreated #42` a second time. Transactional Outbox therefore guarantees **at-least-once** publication, not exactly-once; downstream consumers must be idempotent (for example, by tracking processed message IDs with the Idempotent Consumer pattern).

## In practice

In relational databases, the outbox is a dedicated table written inside the same transaction as business rows:

```sql
BEGIN;
INSERT INTO orders (id, status) VALUES (42, 'CREATED');
INSERT INTO outbox (id, aggregate_id, event_type, payload, sent)
VALUES ('evt-42', '42', 'OrderCreated', '{...}', false);
COMMIT;
```

In NoSQL databases that lack multi-table transactions, the outbox is stored as a property inside each updated document or item.

Chris Richardson describes two ways to implement the Message Relay:

- **Polling Publisher:** Periodically queries `outbox` for unpublished rows and marks or deletes them after broker acknowledgement.
- **Transaction Log Tailing:** Reads inserts directly from the database transaction log (CDC) and forwards them to the broker, avoiding repeated polling queries.

Frameworks such as **Eventuate Tram** implement the Transactional Outbox pattern alongside Idempotent Consumer; **Event Sourcing** is an alternative when the event log itself is the system of record.

## Pitfalls

- **Forgetting to write the outbox row alongside a state change.** Because application code still explicitly inserts outbox messages, a developer updating `orders` without inserting into `outbox` silently drops domain events.
- **Assuming the outbox delivers exactly once.** Relay crashes after broker acknowledgement produce duplicates; every consumer subscribing to outbox events must deduplicate by message ID.
- **Letting processed outbox rows grow without cleanup.** Marking rows `sent=true` without periodically archiving or deleting them bloats the table and slows polling queries.
- **Using a separate outbox table on NoSQL stores without multi-item transactions.** Store outgoing messages as an attribute on the business document itself so state and outbox still commit atomically.

## Further reading

- [Pattern: Transactional outbox — Chris Richardson (Microservices.io)](https://microservices.io/patterns/data/transactional-outbox.html)
