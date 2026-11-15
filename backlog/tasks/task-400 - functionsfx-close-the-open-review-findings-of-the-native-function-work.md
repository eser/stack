---
id: TASK-400
title: 'functionsfx: close the open review findings of the native function work'
status: To Do
assignee: []
created_date: '2026-11-15 22:30'
labels:
  - go
  - functions
milestone: m-6
dependencies:
  - TASK-386
  - TASK-394
  - TASK-396
references:
  - docs/adr/0011-native-functions-behind-the-bridge.md
priority: low
ordinal: 403000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A review of TASK-386 to TASK-399 before 5.0.0 found three defects that were fixed before the work landed (the 500 body of the HTTP trigger, integers above 2^53 in the HTTP and tool-call triggers, and a `go-workflow` step that kept running after its timeout; see the notes of TASK-389 and TASK-393) and the findings below, none of which a shipped caller reaches today.

Schema (pkg/ajan/functionsfx/schema.go): a nil slice or map encodes as `null` while the schema and the generated TypeScript call the field a required array or object (:105-126); an embedded pointer struct is a required property named after its type instead of flattened as encoding/json flattens it (:188); a `[N]byte` array is described as a base64 string where encoding/json writes an array of numbers (:106); the `,string` tag option is ignored; a type with `MarshalJSON` or `MarshalText` gets the schema of its Go structure, not of its JSON form.

Retry (pkg/ajan/functionsfx/retry.go:112-114): without `MaxDelay` the cap is `math.MaxInt64`, and once the backoff passes it the float conversion is out of range; on amd64 the wait becomes negative, so the remaining attempts run without waiting. It needs about 35 attempts with a 1 s initial delay.

Combinators (pkg/ajan/functionsfx/combinators.go:158): `AllPar` drops results that all succeeded when the parent context is cancelled after the last task finished.

Generator (pkg/ajan/functionsfx/tsgen/tsgen.go:157, :318): descriptions go into JSDoc as they are, so a description holding `*/` breaks the generated file. `codebase native-types --check` (cmd/eser/codebase_native_types.go:52-90) checks only the owners that exist now, so the file of an owner that lost its last function stays behind with stale types, and the generator does not add the `./native-functions` export to a new owner's package.json.

Tool output (pkg/@eserstack/workflows/function-tools.ts:76-87): TypeScript treats an output as a ToolOutput by its shape (a boolean `passed` and nothing else), Go by the declared `TriggerWorkflow` (pkg/ajan/workflowfx/functions.go:197), so a function without that trigger that answers `{passed:false}` passes on the Go engine and fails as a `native-function` step.

Bridge streams (pkg/@eserstack/ajan/bridge_functions_stream.go): the cap of 1024 is checked under the read lock and the handle inserted later under the write lock (:83-89), so concurrent opens can pass it by the number in flight; a close waits for the producer on the JavaScript main thread (:195-196), so aborting a `workflow-steps` stream during a shell step blocks the event loop up to the step's 2 s WaitDelay.

The HTTP trigger has no authorization of its own and hands every header, Authorization and Cookie included, to the adapter; its package documentation does not say so.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The schema of every Go type the registry accepts matches what encoding/json writes and reads for it, nil slices and maps included, with a test per case above
- [ ] #2 A retry without MaxDelay keeps its backoff for any number of attempts on amd64 and arm64
- [ ] #3 AllPar answers the results when every task succeeded, whatever the parent context did after
- [ ] #4 A description holding */ yields a valid generated file, and native-types --check fails on a native-functions.ts that no owner writes
- [ ] #5 Go and TypeScript decide the same way whether an output is a ToolOutput
- [ ] #6 The function stream cap holds under concurrent opens, and a close never blocks the JavaScript main thread on a running step
- [ ] #7 The httptrigger package documentation states that authorization belongs to httpfx middleware and that every header reaches the adapter
- [ ] #8 pnpm ok passes
<!-- AC:END -->
