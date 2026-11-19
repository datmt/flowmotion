## Why it exists

Unlike in-memory function calls, remote network calls can hang until a timeout expires, tying up caller threads and connections until an unresponsive dependency triggers cascading failures across multiple services. Wrapping remote calls in a **circuit breaker**—a pattern popularized by Michael Nygard in Release It!—stops callers from invoking a failing supplier once errors pass a threshold, failing fast instead. Any service making synchronous or asynchronous remote calls uses it to conserve resources and give struggling dependencies time to recover.

## How it works

A circuit breaker wraps a protected call inside a three-state machine: `closed`, `open`, and `half-open`. In **Step 1, "Closed: calls flow"**, normal requests pass straight through to the Payments API, and each successful call resets the failure counter to zero.

When failures trip the breaker open, a software circuit breaker does not have to wait for manual intervention to reset. In the **Half-open probe succeeds** branch, after a configured cool-down (`reset_timeout`) elapses since the last failure, **Step 4, "Half-open: one probe"** transitions the breaker to `half-open` and lets a trial call through to test whether Payments is healthy again. In **Step 5, "Closed again"**, that probe succeeds, resetting the failure count and restoring normal traffic.

## What goes wrong

In **Failures trip the breaker**, **Step 2, "Payments starts failing"** shows Payments timing out while the breaker increments its failure counter on every timeout until it reaches the threshold of 3 consecutive failures.

In **Step 3, "Open: fail fast"**, hitting the threshold trips the breaker to `open`. Every subsequent call returns `503 fast-fail` immediately without touching Payments. Callers stop burning threads waiting on timeouts, and Payments avoids taking more load while impaired. If the later trial call in **Step 4, "Half-open: one probe"** fails instead of succeeding, the breaker records the failure, restarts its `reset_timeout`, and stays open rather than reopening the floodgates.

## In practice

A minimal self-resetting breaker exposes four core controls: an `invocation_timeout` per call, a `failure_threshold` to trip open, a `reset_timeout` before probing, and a monitor that alerts on state transitions:

```text
state():
  if failure_count >= failure_threshold:
    if now - last_failure_time > reset_timeout:
      return HALF_OPEN
    return OPEN
  return CLOSED
```

Production implementations such as Netflix's **Hystrix** (and libraries across Java, C#, Ruby, and Scala) go beyond simple consecutive counters. They often trip on error frequency (for example, a 50% failure rate), apply different thresholds by error type (such as 10 timeouts versus 3 connection failures), or execute remote calls on bounded thread pools via futures/promises so the circuit also opens if the thread pool saturates. Asynchronous pipelines apply the same idea by placing requests on a queue drained at the supplier's pace and tripping the circuit when the queue fills up. Every state transition should be logged for monitoring, with operator controls to trip or reset breakers manually.

## Pitfalls

- **Tripping the circuit on normal business errors.** Validation or domain-level exceptions should be handled by application logic; only supplier-health errors such as timeouts or connection failures should count toward opening the breaker.
- **Skipping a client fallback strategy.** A breaker only fails fast; callers still need to decide whether to fail the request, queue work such as a credit card authorization for later processing, or serve acceptable stale read data.
- **Letting high traffic pile up on the initial timeout.** Under heavy load, many concurrent callers can stall waiting for `invocation_timeout` before the threshold is crossed unless calls are isolated behind a bounded thread pool or queue.
- **Leaving breaker transitions unmonitored.** Tripped breakers are an early warning of deeper infrastructure trouble; log state changes, alert on opens, and give operations staff manual trip and reset hooks.

## Further reading

- [Circuit Breaker — Martin Fowler](https://martinfowler.com/bliki/CircuitBreaker.html)
