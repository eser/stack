---
id: TASK-392
title: 'functions: add the native sub-path with fromNative'
status: Done
assignee: []
created_date: '2026-11-10 10:00'
updated_date: '2026-11-13 21:02'
labels:
  - typescript
  - functions
milestone: m-6
dependencies:
  - TASK-391
references:
  - docs/adr/0011-native-functions-behind-the-bridge.md
priority: medium
ordinal: 395000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add @eserstack/functions/native with the NativeCaller port and fromNative<I, O>(caller, name) returning a Handler<I, O, E, Cancellable>. The AbortSignal becomes a bridge cancel, the envelope becomes a Result and the error kind becomes the _tag. mod.ts and the other sub-paths never load the native library and @eserstack/functions gains no dependency. Update the README with the pairing table.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A package that imports only @eserstack/functions loads no native library and its dependencies do not change
- [x] #2 fromNative composes with task.flatMapW, handler.bind and collect like any Handler
- [x] #3 A test with a fake NativeCaller covers success, a failure kind, cancellation and an unknown function
- [x] #4 The README names the pairing table and the native sub-path
- [x] #5 pnpm ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
pkg/@eserstack/functions/native.ts: the port (NativeCaller, NativeCall, NativeOutcome), the errors (NativeError, UnknownFunctionError, NativeFailure, toNativeError) and fromNative<I, O>(caller, name), a Handler<I, O, NativeError, Cancellable>. Exported as the sub-path ./native and as the namespace functions.native, the pattern of handler and task; native.ts is pure TypeScript, so the root does not load a native library.

Decisions: the port's call carries { name, input, signal } and answers { ok, output } or { ok: false, error, kind? }, the shape of FunctionCaller in @eserstack/ajan/ffi/functions (TASK-391); a caller rejects only when no function ran. The kinds ValidationError, AbortError and AdaptError map to the types of the same names in task and handler, UnknownFunction to its own type, any other kind to NativeError with kind kept. A signal that already aborted fails with AbortError without calling Go; a rejection after an abort is an AbortError, otherwise a NativeError with the cause in source. The output is not checked: O is what the caller says, until the generated types of TASK-394.

Tests (native.test.ts, 19): success, null output, laziness, every kind, an unknown kind, no kind, an unreachable library, abort before and during the call, composition with flatMapW, bind, createTrigger, collect and withAbort, and two guards: native.ts imports only ./handler.ts, ./task.ts and the primitives results, and the package dependencies stay [@eserstack/primitives]. The README has a section, an API table and the link to the pairing table of functionsfx; its example was compiled and run from a temporary file.

Not tested here: that FunctionCaller of @eserstack/ajan is assignable to NativeCaller. functions has no dependency on ajan and ajan none on functions, so the check belongs where both are used (TASK-393).

Full gate: go run ./cmd/eser ok passed all steps (exit 0) on 2026-11-14, with a stand-in pnpm that only maps 'pnpm exec <tool>' to node_modules/.bin/<tool>; the real pnpm was not run.
<!-- SECTION:NOTES:END -->
