---
id: TASK-393
title: 'workflows: add tools that run a native function and a Go workflow'
status: Done
assignee: []
created_date: '2026-11-10 10:00'
updated_date: '2026-11-15 22:30'
labels:
  - typescript
  - workflows
milestone: m-6
dependencies:
  - TASK-391
  - TASK-392
references:
  - docs/adr/0011-native-functions-behind-the-bridge.md
priority: medium
ordinal: 396000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add two tools to the @eserstack/workflows registry: one that runs a native function through fromNative, one that runs a workflow on the Go engine through the bridge's workflowRun. The TypeScript engine stays the default of workflows run. Update WIRING.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A TypeScript workflow can call a TypeScript function and a native function in one run
- [x] #2 A TypeScript workflow can run a Go workflowfx workflow and gets its step results
- [x] #3 WIRING.md describes both tools and that Go cannot call TypeScript
- [x] #4 pnpm ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
pkg/@eserstack/workflows: function-tools.ts (createHandlerTool, createNativeFunctionTool, createNativeFunctionTools, toolResultOfOutput) and go-workflow-tool.ts (createGoWorkflowTool, toolResultOfGoWorkflow), exported from mod.ts. The package gains no dependency: the tools take the port to the native library as an argument (NativeCaller of @eserstack/functions/native, and a GoWorkflowRunner this package defines), so it imports no native library. Nothing is registered by workflows run: the TypeScript engine stays the default and an application registers the tools it wants.

Tools: native-function takes the function name from the step's function option and the other options as the input; createNativeFunctionTools makes one tool per function under its own name; go-workflow takes workflow, manifest or manifestFile (default .eser/manifest.yml under root) and only, forwards root, fix, dryRun, _args and _changedFiles, and brings the Go steps back as one step. createHandlerTool is the TypeScript side: it runs a @eserstack/functions Handler (with or without a Cancellable context) as a step, which AC1 needs to put a TypeScript function in a workflow.

Mapping, the same as workflowfx.RegisterFunctions on the Go side: a function that answers a ToolOutput (passed, issues, mutations, stats) fills the step result; any other output passes the step and is not kept, because a TypeScript step's stats hold numbers only (non-numeric stats of a ToolOutput are dropped). ValidationError and AdaptError fail the step with the message and the run goes on; any other failure is thrown, which stops the run unless continueOnError. go-workflow prefixes each issue with its Go step ([validate-eof] ...) and counts steps, failedSteps and durationMs; an error the Go engine answers is thrown.

Tests: function-tools.test.ts (14) and go-workflow-tool.test.ts (8) on fake ports, including a workflow that runs a TypeScript function and a native function in one run and continueOnError; codebase/workflows-native.ffi.test.ts on the real native library: one TypeScript workflow runs ts-count, validate-eof as a native function and a Go workflow, and the native step and the Go workflow report the same issue. WIRING.md has the section (the tools, the mapping, the two one-line ports, and that Go cannot call TypeScript); the README has a short section whose example was compiled from a temporary file.

Not done, on purpose: the eser CLI does not register the two tools, so manifest steps of eser workflows run cannot name them yet. That wiring lives in the package that injects the tools (@eserstack/codebase or @eserstack/cli) and is a separate decision.

Full gate: go run ./cmd/eser ok passed all steps (exit 0) on 2026-11-14, with a stand-in pnpm that only maps 'pnpm exec <tool>' to node_modules/.bin/<tool>; the real pnpm was not run.

Update 2026-11-14: the eser CLI now registers both tools (TASK-398).

Review before 5.0.0: a `go-workflow` step that ran past its timeout kept running in Go, because `workflowRun` had no cancel entry and the bridge ran it on `context.Background()`; a later step of the inner workflow still wrote its file after the TypeScript step had failed. `workflowRun` now takes a `requestId`, runs under `beginCancellable` (pkg/@eserstack/ajan/bridge_workflow.go) and has the `aiCancelRequest` cancel entry (ffi/bindings.ts), so the step's signal stops the running Go step and the steps after it. Test written first: `TestBridgeWorkflowRunStopsOnCancel` (bridge_workflow_cancel_test.go).
<!-- SECTION:NOTES:END -->
