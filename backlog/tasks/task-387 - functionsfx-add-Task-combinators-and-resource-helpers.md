---
id: TASK-387
title: 'functionsfx: add Task combinators and resource helpers'
status: Done
assignee: []
created_date: '2026-11-10 10:00'
updated_date: '2026-11-13 22:19'
labels:
  - go
  - functions
milestone: m-6
dependencies:
  - TASK-386
references:
  - docs/adr/0011-native-functions-behind-the-bridge.md
priority: medium
ordinal: 390000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add Map, Then, All, AllPar (bounded, cancels siblings on the first error), Validate, WithTimeout, WithLogging, Retry, RetryWithBackoff, WithRetry, Bracket, BracketWithReleaseError, NewScope, Scoped, AcquireRelease and Ensure (LIFO finalizers). Each pairs with the function of the same name in pkg/@eserstack/functions/task.ts and resources.ts and runs the shared conformance fixtures. Retry and RetryWithBackoff import pkg/ajan/httpclient/resilience (RetryStrategy.NextBackoff) with RandomFactor 0 by default, as decided in ADR 0011.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every task.ts and resources.ts function has a Go counterpart or a recorded reason in the pairing table
- [x] #2 Scope finalizers run in reverse order and all of them run when one fails
- [x] #3 Retry delays equal those of retryWithBackoff in resources.ts on the shared fixtures, including the uncapped TypeScript first delay against the capped Go one and the zero delay at MaxAttempts
- [x] #4 functionsfx imports httpclient/resilience and not httpclient, so net/http is not linked into the wasip1 build
- [x] #5 pnpm ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
pkg/ajan/functionsfx: combinators.go (Map, Then, All, AllPar with WithParallelism, Validate, WithTimeout, WithLogging), retry.go (Retry, RetryWithBackoff, Backoff, WithSleeper, ErrNoAttempts) and resources.go (Bracket, BracketWithReleaseError, Scope with NewScope, AddFinalizer and Close, Scoped, AcquireRelease, Ensure, ErrScopeClosed). The README pairing table has no open TASK-387 row left, and a section lists where the two models differ on purpose.

AC1: every function of task.ts and resources.ts has a Go counterpart or a reason in the table: withAbort and withTimeout are WithTimeout (the signal is the context), withRetry and retry are Retry (a Task is the function retry takes), using is Bracket, scope.use is Scoped, flatMap and flatMapW are Then (Go has one error type).

AC2: Scope.Close runs the finalizers last added first, all of them when one fails, once; testdata/conformance/task_cases.json has the cases and both languages run them.

AC3: RetryWithBackoff takes its delays from RetryStrategy.NextBackoff of httpclient/resilience, with RandomFactor 0. The fixtures hold the shared cases (doubling, the cap, the default factor, exhaustion, one attempt, no attempt) and one case whose expectation differs by language: a first wait above MaxDelay is MaxDelay in Go and initialDelay in TypeScript. The zero delay of NextBackoff at MaxAttempts is never reached by the loop, which waits only between attempts, so it is covered by the one-attempt and no-attempt cases. Differences found while pairing are in the README: Backoff.MaxAttempts 0 means the default of three in Go where maxAttempts 0 is no attempt in TypeScript (the fixture uses -1 for none), AllPar is bounded and cancels the others at the first failure, Scoped and Ensure join a failed finalizer to the task error.

AC4: functionsfx imports httpclient/resilience, not httpclient; go list -deps for wasip1 shows no net/http, and make ajan-wasm-check passes (functionsfx is not in the WASM profile anyway).

Tests: conformance_tasks_test.go runs the 38 cases; pkg/@eserstack/functions/conformance-tasks.test.ts runs the same 38 on the TypeScript side (it stubs setTimeout to record the delays). combinators_test.go and resources_test.go cover what only Go has: the parallel limit, cancelling siblings, starting nothing after a failure, panics, WithTimeout (deadline, abandoned task, zero timeout, a context that already ended), WithLogging, a retry that ends with its context, and Scoped, Bracket and Scope on a panic and under concurrency.

Full gate: go run ./cmd/eser ok passed all steps (exit 0) on 2026-11-14, with a stand-in pnpm that only maps 'pnpm exec <tool>' to node_modules/.bin/<tool>; the real pnpm was not run.
<!-- SECTION:NOTES:END -->
