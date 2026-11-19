## Why it exists

Long-running workflows—such as order fulfillment, billing cycles, or multi-step sagas—can span minutes or years across machines that crash, restart, or deploy new code at any moment. Persisting every step by hand into state tables and retry cron jobs quickly tangles business logic with recovery plumbing. **Temporal workflow replay** gives functions **durable execution**: the Temporal Service appends every workflow action and result to an immutable **Event History**, allowing any worker to crash mid-function and another worker to reconstruct exact local state and continue from the last recorded event.

## How it works

A Temporal Workflow Execution progresses by issuing **Commands** (such as scheduling an Activity or starting a Timer) and blocking on Temporal SDK **Awaitables**. Every action the Temporal Service takes is durably appended to Event History.

In **Step 1, "Start workflow"**, the client starts the execution. Temporal Server persists `WorkflowStarted` in Event History and dispatches a Workflow Task to Worker A.

In **Step 2, "Activity completes"**, Worker A runs the workflow function and schedules the `ChargeCard` Activity (side-effecting external calls always live inside Activities, never directly inside workflow code). When `ChargeCard` finishes, its outcome (`ChargeCard done`) is appended to Event History.

In **Step 3, "Worker A crashes"**, Worker A dies and loses all in-memory local variables. Because Event History—not worker RAM—is the source of truth, no workflow progress is lost.

In **Step 4, "Worker B takes over"**, Temporal Server times out Worker A's uncompleted Workflow Task and dispatches the workflow to Worker B, which has no cached state for it.

In **Step 5, "Replay history"**, Worker B fetches Event History and re-runs the workflow function from line 1. Whenever the workflow code issues a Command that already has a matching Event (`ChargeCard done`), the SDK verifies the command matches history and immediately returns the recorded result without re-running `ChargeCard`.

In **Step 6, "Continue where it stopped"**, replay brings Worker B's local variables up to the exact point where Worker A crashed. From there, Worker B schedules new work (`ShipOrder`), appends `ShipOrder done` to history, and finishes the workflow.

## What goes wrong

The crash recovery shown in **Step 3, "Worker A crashes"** through **Step 5, "Replay history"** depends entirely on **deterministic replay**: re-executing the workflow function must emit the exact same sequence of Commands recorded in Event History.

If a workflow calls a wall-clock function (`time.Now()`), generates unseeded randomness, iterates over an unordered map, performs direct network I/O, or gets modified in a breaking way while executions are still open, the replayed Commands diverge from Event History. Temporal detects the mismatch, throws a **non-determinism error**, and fails the Workflow Task rather than corrupting state.

A second failure mode is unbounded history growth: a single Workflow Run hits a warning at **10,240 events** and a hard failure limit at **51,200 events** (or **50 MB**), terminating long-running loops that never reset their history.

## In practice

During normal operation, Temporal avoids replaying from scratch on every turn using **Sticky Execution**: each Worker keeps an in-memory **LRU Workflow Cache**, and Temporal routes subsequent tasks for that workflow back to the same worker via a dedicated Sticky Queue. Full replay runs only when a worker crashes or evicts the workflow from cache.

To keep replays safe and histories bounded, Temporal provides deterministic SDK helpers (`workflow.Now`), **Continue-As-New** (which atomically closes a run and starts a fresh Event History under the same Workflow ID), and **Worker Versioning** (which pins in-flight executions to their original Worker Deployment Version while new runs use the new build) or code-level **Patching**:

```go
func OrderWorkflow(ctx workflow.Context, orderID string) error {
    startedAt := workflow.Now(ctx) // deterministic replay-safe timestamp
    if err := workflow.ExecuteActivity(ctx, ChargeCard, orderID, startedAt).Get(ctx, nil); err != nil {
        return err
    }
    return workflow.ExecuteActivity(ctx, ShipOrder, orderID).Get(ctx, nil)
}
```

## Pitfalls

- **Calling system clocks, random generators, or external APIs inside workflow code.** Always put non-deterministic I/O inside **Activities** and use SDK primitives like `workflow.Now` inside the workflow function.
- **Deploying breaking workflow logic changes without Worker Versioning or Patching.** Changing command order or adding/removing Activities breaks replay for already-open workflows and triggers non-determinism errors.
- **Letting infinite or high-iteration workflows run forever in one Run.** Call **Continue-As-New** well before the 51,200-event / 50 MB limit to keep replays fast and prevent hard run failures.
- **Storing critical workflow state in Memos.** Temporal Memos are non-indexed metadata (capped at 40 KB on Temporal Cloud) and are eventually consistent; keep execution state in workflow inputs, variables, and Event History.

## Further reading

- [Temporal Documentation — Workflow Execution overview](https://docs.temporal.io/workflow-execution)
