---
id: TASK-391
title: >-
  ajan bridge: serve functionsfx through functions.call, functions.list and a
  stream
status: Done
assignee: []
created_date: '2026-11-10 10:00'
updated_date: '2026-11-13 20:28'
labels:
  - go
  - bridge
  - functions
milestone: m-6
dependencies:
  - TASK-386
references:
  - docs/adr/0011-native-functions-behind-the-bridge.md
priority: medium
ordinal: 394000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add the generic names functions.call (request {name, input}), functions.list and one stream name for functions that produce a sequence to pkg/@eserstack/ajan. Map the function error kind into the existing envelope. Add the TypeScript NativeCaller implementation to @eserstack/ajan. abiVersion stays 3. A descriptor reports whether a function runs in the WASM profile.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 functions.call and functions.list answer in the native and the WASM build, or the WASM build answers UNSUPPORTED_IN_WASM for the functions that need the network
- [x] #2 A cancelled call stops the Go function through its context
- [x] #3 The handshake name list holds the generic names and not one name per function
- [x] #4 pnpm ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Names are functionCall and functionList, not functions.call and functions.list: the reactor protocol reserves dotted names for its stream operations (reactor_protocol.go). Request { name, input, requestId? }, answer { output } or { error, errorKind }, the AI answer shape. See the ADR 0011 amendments.

Go (pkg/@eserstack/ajan): bridge_functions.go registers the two names on a registry (bridgeFunctions) that starts empty; TASK-395 adds the first functions. An error answer carries the kind of the Go error (functionsfx.ToWire), the bridge adds UnknownFunction, and an empty message is replaced because an error answer with an empty error reads as success to the dispatcher. Cancellation reuses beginCancellable and aiCancelRequest, so the TypeScript library adds the requestId (cancel: aiCancelRequest in the binding). Tests: bridge_functions_test.go covers success, a null output, kinds, an input the schema refuses, an unknown name, the HANDLER_ERROR envelope, a cancel while the function runs, a cancel that arrived first, the list and the handshake. dispatch_test.go counts 102 names.

WASM (AC1, second option): native only. functionsfx links jsonschema, +1.7 MB on the WASM profile (8,093,348 to 9,815,465 bytes, measured with go build -overlay with and without the file), and make ajan-wasm-check limits the profile to 8,000,000 bytes; it was at 7,906,884. The WASM build answers UNSUPPORTED_IN_WASM for both names. The stream name moved to TASK-396.

TypeScript (@eserstack/ajan): bindings.ts has functionCall (blocking, cancel aiCancelRequest) and functionList with FunctionCallRequest, FunctionCallAnswer, FunctionDescriptor and FunctionListAnswer. ffi/functions.ts has callFunction, listFunctions and functionCaller, and the outcome type FunctionOutcome ({ ok: true, output } or { ok: false, error, kind? }); a signal that aborts answers an AbortError outcome. The port of @eserstack/functions/native (TASK-392) takes this shape, and @eserstack/functions imports nothing from this package. Exported as @eserstack/ajan/ffi/functions. ffi/functions.test.ts runs on the fake library; bindings.test.ts lists the new blocking and cancel names.

Verified: go test -race ./... in the bridge module, go vet, gofmt; make ajan-lib ajan-wasm-check (7,906,884 bytes, links no forbidden package); codebase/ajan-ffi-parity.test.ts, ffi/bindings.test.ts, ffi/functions.test.ts; tsc --noEmit, oxlint and oxfmt --check over the repository.

Full gate: go run ./cmd/eser ok passed all 35 steps (exit 0) on 2026-11-13, run with a stand-in pnpm that only maps 'pnpm exec <tool>' to node_modules/.bin/<tool>, because pnpm is not installed in the agent shell. The real pnpm was not run.
<!-- SECTION:NOTES:END -->
