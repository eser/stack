---
id: TASK-397
title: 'nativefx: add workflow-steps, the first native function that streams'
status: Done
assignee: []
created_date: '2026-11-14 05:21'
updated_date: '2026-11-14 05:27'
labels:
  - go
  - bridge
  - functions
milestone: m-6
dependencies:
  - TASK-396
references:
  - docs/adr/0011-native-functions-behind-the-bridge.md
priority: medium
ordinal: 400000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add the function workflow-steps to the native catalog (pkg/ajan/nativefx, owner @eserstack/workflows). It runs a workflow of a manifest on the Go engine and answers each step as it ends, so a TypeScript caller sees the progress of a Go run through fromNativeStream instead of waiting for workflowRun. It is the first function that uses the stream support of TASK-396, and it closes the gap WIRING.md named (the bridge streams nothing yet).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 workflow-steps is registered as a stream function with input and output schemas and the owner @eserstack/workflows
- [x] #2 Each step is an item in the order it ends; a failed step is an item and the run goes on; a missing workflow or step filter is a ValidationError
- [x] #3 A reader that stops, or a context that ends, cancels the run and waits for it, so no step outlives the stream
- [x] #4 The types are generated into @eserstack/workflows (native-functions.ts, with its export) and native-types --check passes
- [x] #5 A test on the real native library reads the steps through fromNativeStream, stops early, aborts a long step and gets a ValidationError
- [x] #6 The full gate passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
pkg/ajan/nativefx/workflow_steps.go: WorkflowStepsInput (manifest text, workflow id, root, only, args, changedFiles, timeoutMs, fix, dryRun), WorkflowStep (name, passed, durationMs, issues, mutations, stats) and workflowStepsFunction, registered by nativefx.Register with owner @eserstack/workflows. The run goes in its own goroutine with an unbuffered channel fed by OnStepEnd, so a slow reader slows the run; a stopped reader or an ended context cancels it and the stream waits for it to close the channel. A panic in the run is caught in that goroutine and ends the stream as ErrWorkflowPanic. A failed step is an item and the run goes on: the engine does not stop at a failed step (my first test assumed it did; the engine stops only on an error). Mutations are reported, not applied. The tool set is the shell tool and RegisterManifestTools, the same as bridge_workflow.go, kept as a private copy in nativefx. Types: pkg/@eserstack/workflows/native-functions.ts generated, export added to its package.json (exports and publishConfig). cmd/eser native-types test env now creates both owner packages. Tests: 8 Go tests (-race, 5 runs) and 5 on the real library in codebase/workflows-native.ffi.test.ts (steps in order, validate-eof issue, early stop leaves no later step, ValidationError, AbortError at 300 ms on sleep 30). validators-native.ffi.test.ts said no function streams; it now says workflow-steps is the only one. Not covered: the WASM profile (functions are native only; size unchanged at 7906884). Full gate: 36 passed, exit 0, through the pnpm exec shim (no pnpm in this shell); pinned golangci-lint clean on both modules.
<!-- SECTION:NOTES:END -->
