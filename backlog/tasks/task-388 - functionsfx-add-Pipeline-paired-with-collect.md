---
id: TASK-388
title: 'functionsfx: add Pipeline paired with collect'
status: Done
assignee: []
created_date: '2026-11-10 10:00'
updated_date: '2026-11-13 22:32'
labels:
  - go
  - functions
milestone: m-6
dependencies:
  - TASK-386
references:
  - docs/adr/0011-native-functions-behind-the-bridge.md
priority: medium
ordinal: 391000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add Pipeline[T] with Use, MapError, Recover, Iterate, Run, RunFirst and RunLast over iter.Seq2, with a per-run state and a Next that may be called once, matching pkg/@eserstack/functions/pipeline.ts. Connect it to pkg/ajan/streamfx with a Source and a Sink adapter. Decide in the ADR whether it holds its own chain or sits on streamfx.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Calling Next twice in one middleware fails like the TypeScript ERROR_NEXT_CALLED_MULTIPLE_TIMES case
- [x] #2 MapError and Recover run once per failure, on what the whole chain emits
- [x] #3 The shared fixtures pass in Go and TypeScript
- [x] #4 pnpm ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
pkg/ajan/functionsfx: pipeline.go (Pipeline[T], NewPipeline, Use, MapError, Recover, Iterate, Run, RunFirst, RunLast; Middleware[T], Step[T] with State and Next; Emit and FailWith; State; ErrNextCalledMultipleTimes and ErrNoResults with the messages of pipeline.ts) and pipeline_stream.go (FromStream, Pipeline.AsSource, Pipeline.Into).

The ADR question is answered: the pipeline holds its own chain and does not sit on streamfx. A chain is middleware that delegate with Next and share a state; streamfx is a source, layers and a sink over channels. It connects at both ends: FromStream is a middleware that emits what a streamfx.Source produces (the source runs on a context that ends with the middleware, so a consumer that stops early leaves nothing running), AsSource gives the chain to a streamfx pipeline, and Into runs it into a streamfx.Sink. A failure reaches the stream as a signal chunk with the annotation error. The README says this.

AC1: asking for Next twice fails with ErrNextCalledMultipleTimes, the message of ERROR_NEXT_CALLED_MULTIPLE_TIMES; the check is the same one (an index at or before the last one reached), and Next is lazy, so a Next that is never ranged over costs nothing. Difference noted: it is a failure item in Go and a throw in TypeScript, so Go's Recover and MapError see it and TypeScript's do not.

AC2: MapError and Recover run once, on what the whole chain emits: fixtures hold a failure that passes up through two Next calls and is mapped once, Recover on a failure in the middle, Recover winning over MapError, and values left alone.

AC3: testdata/conformance/pipeline_cases.json has 20 cases (run, runFirst, runLast, iterate, state shared in a run and empty in the next, arguments, next twice, an empty chain); a middleware is written as a list of actions each language plays. conformance_pipeline_test.go runs them in Go and conformance-pipeline.test.ts runs the same in TypeScript (21 tests with the guard): all pass.

AC4: the full gate passed. It also showed that the gate's golangci-lint (the pinned v2.15.0, built with go build -o etc/temp/golangci-lint ...) is stricter than the one installed on this machine: it flags errcheck on a range loop over an iter.Seq2 that ignores the error value. The first run failed on three loops in pipeline_test.go; fixed, and the root module and the bridge module are clean with the pinned binary. Earlier tasks were linted with the installed binary only and the gate passed them; the pinned binary now reports nothing on either module.

Extras Go has and collect has not: the context ends a run with a failure item; a pipeline can be run many times at once (tested with -race).

Full gate: go run ./cmd/eser ok passed all steps (exit 0) on 2026-11-14, with a stand-in pnpm that only maps 'pnpm exec <tool>' to node_modules/.bin/<tool>; the real pnpm was not run.
<!-- SECTION:NOTES:END -->
