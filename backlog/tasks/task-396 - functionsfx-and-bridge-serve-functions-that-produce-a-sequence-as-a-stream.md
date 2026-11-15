---
id: TASK-396
title: 'functionsfx and bridge: serve functions that produce a sequence as a stream'
status: Done
assignee: []
created_date: '2026-11-13 20:26'
updated_date: '2026-11-15 23:40'
labels:
  - go
  - bridge
  - functions
milestone: m-6
dependencies:
  - TASK-388
  - TASK-391
references:
  - docs/adr/0011-native-functions-behind-the-bridge.md
priority: medium
ordinal: 399000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add the Go type of a function that answers a sequence (an iter.Seq2 of JSON values, the Iterate of Pipeline[T]) to functionsfx, and one stream name to the bridge that opens such a function, reads its chunks and closes it, in pkg/@eserstack/ajan. It was part of TASK-391 and moved here because the function type comes from TASK-388. A closed or cancelled stream stops the Go function through its context.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A function that yields values is registered in functionsfx and its descriptor says it streams
- [x] #2 The bridge stream name opens it, answers its chunks until null and closes it, and a close stops the Go function
- [x] #3 The binding table and the parity test list the stream name, and abiVersion stays 3
- [x] #4 pnpm ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Go, pkg/ajan/functionsfx/stream.go: StreamHandler[I, O] (a function from a context and an input to an iter.Seq2 of values and errors), StreamFunction (Function plus Open), NewStreamFunction (the same options as NewFunction; the descriptor says Stream, and its output schema describes one item), Registry.Stream, ErrStreamOnly and ErrNotStream. Open checks and decodes the input as Call does, so a refused input is the error of Open before anything is produced; a failure of the function is the last item; stopping the loop stops the producer. Call on a function that streams is ErrStreamOnly: collecting an unbounded sequence into one answer is the caller's choice. NewFunction and NewStreamFunction share describe(), which builds the descriptor and compiles the schemas.

AC1: a function that streams is registered like any other and its descriptor says so (Descriptor.Stream, JSON field stream); functionList carries it, and the generated types mark it readonly stream: true (tsgen).

AC2: the bridge stream name functionStream (bridge_functions_stream.go) opens it, answers each item as { output } until null, and closes it. A failure of the function is the last item { error, errorKind } followed by null. Close ends the context, so a function that honors it stops, and a read that is waiting for an item returns null (tested). The function runs in a goroutine of its own with its own recover (a panic becomes a failure item), the reader and the producer meet at a channel with room for one item, so a slow reader slows the function, and at most 1024 streams are open at once (TooManyStreams). Open answers UnknownFunction, NotAStream or ValidationError as a failure, functionCall on a function that streams answers StreamOnly, and a shutdown drain ends every open stream. Tests: bridge_functions_stream_test.go.

AC3: bindings.ts has functionStream (blocking, cancel close, wasm no); the parity test passes against the rebuilt library, and bindings.test.ts lists it among the blocking names and the cancel entries. abiVersion stays 3: the dispatcher already had stream operations. dispatch_test.go counts 103 names and 10 streams.

TypeScript: @eserstack/ajan/ffi/functions has streamFunction (items as outcomes, a failure last, an AbortError for an aborted signal, the stream closed when the loop stops) and functionStreamCaller; @eserstack/functions/native has fromNativeStream and the NativeStreamCaller port, which gives Results a collect pipeline can yield*. validators-native.ffi.test.ts on the real library assigns streamFunction to NativeStreamCaller, so tsc checks the two ports have the same shape, and runs fromNativeStream on a function that does not stream and on an unknown name. No function in the catalog streams yet, so there is no end-to-end run of an item through the real library from TypeScript; the Go side covers items, failures, closing and panics through the dispatcher exports with a function registered for the test.

AC4: the full gate passed on the third run. The first failed on a test of mine, TestFunctionNamesAreGenericOnTheHandshake, which allowed two generic names and met a third: I had run a subset of the bridge tests, not the whole module. It lists functionStream now, and the whole bridge module passes with -race.

Full gate: go run ./cmd/eser ok passed all steps (exit 0) on 2026-11-14, with a stand-in pnpm that only maps 'pnpm exec <tool>' to node_modules/.bin/<tool>; the real pnpm was not run.

Review before 5.0.0: a stream read to its end kept its handle until a close, so a caller of `lib.stream("functionStream")` that never closed would fill the cap of 1024. `bridgeFunctionStreamRead` now releases the handle and the context at the end, as the codebase walk stream does (`TestAStreamReadToItsEndReleasesItsHandle`), and `TestCloseOfUnknownHandleSucceedsEverywhere` covers `bridgeFunctionStreamClose`. The TypeScript docs of the error kinds list every kind the bridge answers.

Fourth review point, from the first FFI and Workers run of main at 6573569e: `a reader that stops after one step stops the Go run` (pkg/@eserstack/codebase/workflows-native.ffi.test.ts:277) failed on ubuntu-24.04-arm, the second step had run. Root cause in the bridge: the producer handed each item to a channel with a buffer of one and went on with the sequence at once (pkg/@eserstack/ajan/bridge_functions_stream.go, `produceFunctionStream`), so a function ran up to two items ahead of its reader. The channel has no buffer now, and after each item the producer waits on `demand`, which every read after the first fills, or on the end of the context, so a close stops the function before it makes another item. `TestAFunctionStreamProducesAnItemOnlyWhenItIsRead` closes after one read and counts the items made, ordered by the close, which waits for the producer; it failed 20 times in 20 before the change, with 3 items made, and passes 20 in 20 after. ADR 0011 says the function runs only as far as its reader asks.
<!-- SECTION:NOTES:END -->
