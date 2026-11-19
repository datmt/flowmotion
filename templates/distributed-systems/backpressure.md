## Why it exists

When requests arrive faster than a service can finish them, accepting work without limit drives response times up a steep hockey-stick curve until the process crashes. Putting a bounded queue between a fast producer and a slower consumer caps waiting work and signals the producer to slow down or shed overflow, preserving throughput and latency for work already accepted. Systems that connect network gateways to asynchronous workers or durable downstream stores rely on this **backpressure** mechanism whenever sustained arrival rates exceed processing capacity.

## How it works

A service's capacity depends on its worker thread pool size and how long each transaction takes. In **Step 1, "Producer and consumer run at the same pace"**, items leave the bounded FIFO queue as quickly as they arrive (`m1` drains as `m2` enters), so queue depth stays shallow and latency stays flat.

Bounded queues exist to absorb short bursts without letting wait times grow unchecked. By Little's Law, the queue length directly sets the ceiling on queuing latency for a given pool size and transaction time:

```text
max latency  = (transaction time / number of threads) * queue length
queue length = max latency / (transaction time / number of threads)
```

As long as the arrival rate stays at or below the consumer's drain rate, the queue stays well under its capacity and the producer never has to pause.

## What goes wrong

In the **Producer outpaces consumer; backpressure engages** branch, a slower downstream database raises transaction time while the producer keeps emitting traffic. In **Step 2, "Consumer slows down; queue fills to 3/3"**, messages `m2`, `m3`, and `m4` fill every slot in the buffer.

Without a bound, trouble starts well before memory runs out: once a growing queue exceeds the CPU cache, consumer threads suffer cache misses right when they are struggling to keep up, compounding the slowdown. On Linux, default memory overcommit allows allocations to succeed until the kernel's OOM killer terminates processes, risking crash-time data corruption.

Instead, **Step 3, "Queue applies backpressure upstream"** rejects or blocks `m5` at capacity. Blocking the thread reading from the network causes TCP sender buffers to fill and propagates pressure back through upstream gateways toward the caller. For synchronous protocols such as REST, a gateway reading a full queue returns a meaningful server-busy response such as HTTP `503`. When the consumer finishes `m2` in **Step 4, "Consumer catches up and resumes demand"**, the freed slot lets the producer resume at the consumer's actual pace rather than flooding it again.

## In practice

Layered architectures separate protocol-handling gateways (such as Servlet web containers) from domain transaction services using bounded FIFO queues between them, tuning each queue to contribute its share of the end-to-end latency budget. Cutting individual transaction time improves both normal latency and worst-case overload capacity.

For asynchronous stream processing across threads or network transports (TCP, UDP, HTTP, and WebSockets), the **Reactive Streams** specification—mirrored 1:1 by `java.util.concurrent.Flow` in JDK 9 and later—standardizes non-blocking, asynchronous backpressure so receivers never buffer arbitrary amounts of live data.

Operators pair bounded queues with monitoring: alert on queue utilization before saturation (for example, at 70% full) and sample per-transaction latency to spot algorithmic regressions such as `O(n)` or `O(n^2)` queries as working-set data grows.

## Pitfalls

- **Assuming synchronous code has no queues.** Thread pools still hide lock or semaphore wait queues, and spawning a thread per request pushes contention onto OS processor run queues with heavy context-switching overhead.
- **Letting slow clients tie up gateway threads.** A client that reads responses slowly holds a gateway thread idle, reducing active concurrency and lengthening wait times for every other caller.
- **Blocking to signal backpressure in async pipelines.** Synchronous backpressure signaling across asynchronous boundaries negates the concurrency benefits of asynchronous processing.
- **Using backpressure on unthrottlable firehoses.** When an upstream source cannot be paused or rejected—such as a live market data feed—queues will still grow under overload. Logging pipelines may tolerate added lag, but latency-sensitive consumers such as trading systems are better off dropping stale updates to keep the latest view.

## Further reading

- [Applying Back Pressure When Overloaded — Martin Thompson (Mechanical Sympathy)](https://mechanical-sympathy.blogspot.com/2012/05/apply-back-pressure-when-overloaded.html)
- [Reactive Streams — Asynchronous Stream Processing with Non-Blocking Back Pressure](https://www.reactive-streams.org/)
