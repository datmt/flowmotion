## Why it exists

Remote calls fail transiently because of packet loss, brief overloads, or rolling restarts, yet retrying immediately in an unbounded loop turns minor hiccups into retry storms and lets one broken message clog a worker forever. **Retry with exponential backoff, jitter, and a dead-letter queue (DLQ)** gives transient failures time to clear while capping total attempts and quarantining messages that still fail. Queue-backed services and event consumers rely on this combination to recover automatically from short outages without taking down struggling downstream APIs.

## How it works

A worker pulls a message from the main queue and retries transient downstream failures with exponentially growing delays until either the call succeeds or the retry budget runs out.

In **Step 1, "Attempt 1 fails"**, the worker reads `msg-42` from Orders Queue and calls Flaky Partner API. The call fails (for example, a timeout or `5xx` error), so the worker schedules a first retry after a **1s** base delay instead of hammering the partner immediately.

In **Step 2, "Attempt 2 fails"**, the first retry fails too, so the worker doubles the delay to **2s**. **Exponential backoff** spaces attempts further apart as failures persist, reducing load on an already strained dependency.

In the **Partner recovers on retry 2** branch, **Step 3, "Retry succeeds"** shows the normal recovery case: the partner responds before the budget expires, so the worker acknowledges `msg-42` and deletes it from Orders Queue without touching the DLQ.

In the main **Retries exhausted** path, **Step 3, "Attempt 3 fails"** doubles the delay again to **4s**. Real implementations cap the maximum delay and mix in random **jitter** so that clients failing at the same moment do not wake up and retry in synchronized waves.

In **Step 4, "Park in the DLQ"**, the worker hits its retry limit and routes `msg-42` to the **Dead-letter Queue** instead of looping indefinitely, freeing the worker to process healthy messages while preserving the failed payload for inspection and later redrive.

## What goes wrong

When retries are poorly bounded or uncoordinated, the recovery mechanism itself causes cascading failures. In the **Retries exhausted** path (**Step 4, "Park in the DLQ"**), a persistent outage or malformed "poison pill" message would consume worker capacity forever if there were no maximum attempt count and DLQ handoff.

Even with exponential backoff, deterministic delays (`1s`, `2s`, `4s`) keep concurrently failing workers synchronized into thundering-herd spikes that knock a recovering downstream service back down. Worse, when every tier in a deep call stack retries independently—such as 3 retries at each of three layers—a single user request multiplies into 27x downstream load (**retry amplification**), accelerating an overload into a full outage.

## In practice

AWS recommends pairing **capped exponential backoff with full jitter**—picking a uniform random sleep from `0` up to the capped exponential window—and enforcing client-side **retry quotas** (token buckets that deduct tokens on retries and refill on successes) as used in AWS SDKs:

```text
sleep = random_between(0, min(cap, base * 2^attempt))
```

In Amazon SQS, queues implement DLQ handoff via a **redrive policy** specifying `deadLetterTargetArn` and `maxReceiveCount` (how many times a consumer can receive a message without deleting it before SQS moves it to the DLQ):

```json
{
  "deadLetterTargetArn": "arn:aws:sqs:us-east-1:123456789012:OrdersDLQ",
  "maxReceiveCount": "5"
}
```

AWS also advises configuring retries at a single layer in the call stack (typically the outermost boundary) while lower layers fail fast, and setting the DLQ's retention period longer than the source queue's so engineers have time to debug failed messages before they expire.

## Pitfalls

- **Retrying non-idempotent operations without idempotency keys.** A timed-out request may have already succeeded on the server; retrying a charge or creation call without an idempotency key duplicates side effects.
- **Retrying client errors (`4xx`) alongside transient errors.** Bad payloads or authentication failures will not succeed on retry and only waste retry budget and downstream capacity.
- **Stacking retries across every service layer.** Retrying at multiple hops multiplies traffic exponentially during partial outages; retry at one layer and fail fast elsewhere.
- **Using backoff without jitter or a ceiling.** Fixed exponential schedules create synchronized retry waves, and uncapped exponential growth produces multi-hour delays.
- **Treating the DLQ as a trash can.** Without alerting, retention headroom, and a tested redrive procedure, messages parked in the DLQ silently expire and lose customer work.

## Further reading

- [Amazon Builders' Library — Timeouts, retries, and backoff with jitter (Marc Brooker)](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
- [AWS Architecture Blog — Exponential Backoff And Jitter (Marc Brooker)](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
- [Amazon SQS Developer Guide — Using dead-letter queues in Amazon SQS](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html)
