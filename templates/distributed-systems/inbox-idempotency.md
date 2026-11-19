## Why it exists

Message brokers that guarantee at-least-once delivery keep resending a message whenever acknowledgements are lost or consumers crash, so any consumer can receive the same message more than once. For non-idempotent operations—such as subtracting a debit from an account balance—a duplicate delivery corrupts state unless the consumer detects and discards messages it has already applied. The **Idempotent Consumer** (or **inbox**) pattern records processed message IDs atomically with business state changes so repeated deliveries produce the same outcome as a single delivery.

## How it works

In **Step 1, "Broker delivers msg-9"**, the broker hands `msg-9` (`debit $30`) to the Payment Consumer under at-least-once delivery. Until the consumer explicitly acknowledges `msg-9`, the broker keeps the message eligible for redelivery.

In **Step 2, "Record msg-9 and update balance atomically"**, the consumer starts a single local database transaction, inserts `msg-9` into the `inbox` (or `PROCESSED_MESSAGES`) table under a unique key, and debits `balances` from `$100` to `$70`. Because both writes share one ACID transaction, either both commit together or both roll back.

In **Step 3, "Acknowledge message to broker"**, only after the database commit is durable does the consumer send `ACK msg-9` so the broker removes the message from the queue.

## What goes wrong

If a failure strikes between the database commit and the broker acknowledgement, the broker has no way to know the message succeeded. In the **Redelivery is safely ignored** branch, **Step 3, "Consumer crashes before ACK"** kills the consumer right after `atomic-tx` commits `$70` to the database.

In **Step 4, "Broker redelivers msg-9"**, the broker delivers the identical `msg-9` to a replacement consumer. Without an inbox record, applying the debit again would drop the balance to `$40`. In **Step 5, "Unique constraint detects duplicate"**, the consumer attempts `INSERT msg-9` into `inbox`, hits the primary-key duplicate violation, rolls back the transaction without touching `balances`, and sends `ACK msg-9` so the broker stops redelivering.

## In practice

In relational databases, Chris Richardson's Idempotent Consumer pattern uses a `PROCESSED_MESSAGES` table keyed by `(subscriber_id, message_id)` and inserts the key at the start of the business transaction:

```sql
BEGIN;
INSERT INTO processed_messages (subscriber_id, message_id)
VALUES ('payment-consumer', 'msg-9');
UPDATE balances SET amount = amount - 30 WHERE account_id = 1;
COMMIT;
```

On a primary-key conflict, the handler rolls back, skips the business update, and acknowledges the message. Frameworks such as **Eventuate** implement this pattern alongside Transactional Outbox to handle deduplication automatically.

For NoSQL databases (such as DynamoDB) that do not support multi-table ACID transactions, consumers store processed message IDs directly inside the target business entity—for example, using a conditional update that appends `message_id` to a set attribute only if it is absent—or, when event IDs are strictly monotonic per aggregate (such as in CQRS read projections), storing only the highest event ID processed so far.

## Pitfalls

- **Recording the message ID outside the business transaction.** Writing `inbox` and updating `balances` in separate transactions reintroduces a crash window where one succeeds and the other fails, causing either double-charging or silently skipped updates.
- **Forgetting to acknowledge duplicates to the broker.** Throwing an unhandled error on a duplicate key instead of acknowledging `msg-9` causes the broker to redeliver the message forever (or route a valid message to a dead-letter queue).
- **Using a separate `PROCESSED_MESSAGES` table with NoSQL stores that lack multi-table transactions.** Embed processed IDs in the target document with conditional updates instead.
- **Checking before inserting without a unique constraint.** A read-then-write check (`SELECT` followed by `INSERT`) races when two consumer instances receive the same message concurrently; rely on the database's primary key or unique constraint to serialize duplicates.

## Further reading

- [Pattern: Idempotent Consumer — Chris Richardson (Microservices.io)](https://microservices.io/patterns/communication-style/idempotent-consumer.html)
