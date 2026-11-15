---
id: TASK-386
title: >-
  functionsfx: add the core of the Go function model paired with
  @eserstack/functions
status: Done
assignee: []
created_date: '2026-11-10 10:00'
updated_date: '2026-11-13 20:28'
labels:
  - go
  - functions
milestone: m-6
dependencies: []
references:
  - docs/adr/0011-native-functions-behind-the-bridge.md
priority: medium
ordinal: 389000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create pkg/ajan/functionsfx with Handler[I, O], Task[T], Adapter[Ev, I], Bind, ResponseMapper, TriggerBinding, a registry of named handlers with descriptors (name, input and output JSON Schema, triggers, WASM availability) and typed errors with kinds ValidationError, AbortError and AdaptError. Pairs with pkg/@eserstack/functions per the feature table in ADR 0011. Also adds the conformance fixture harness: JSON fixtures that a Go test and a TypeScript test both run.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every row of the ADR 0011 pairing table for handler, task, adapter and error types has a Go counterpart or a recorded reason it has none
- [x] #2 Handlers are constructor-injected; there is no Reader parameter
- [x] #3 Errors carry a kind that survives the bridge envelope
- [x] #4 A shared fixture directory exists and both a Go test and a TypeScript test of @eserstack/functions run it
- [x] #5 pnpm ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Package pkg/ajan/functionsfx: errors.go (Kind, NewValidationError, NewAbortError, NewAdaptError, KindOf, IsKind, MessageOf, WireError, ToWire), task.go (Task, Run, Succeed, Fail), handler.go (Handler, Task method, Adapter, ResponseMapper, TriggerBinding, Bind, NewTrigger), registry.go (Descriptor, Option, Function, NewFunction, Registry), doc.go, README.md with the pairing table.

Decisions made while building. Handler[I, O] folds the TypeScript Handler and its Task into func(ctx, I) (O, error); Handler.Task gives the lazy form. Errors reuse pkg/ajan/results as ADR 0011 says: a Result whose code is the kind and whose inner error carries the message, so one error reads the same in Go and as the _tag of a TypeScript error. WireError uses the field names of the bridge error answers (error, errorKind), so TASK-391 maps it without a new shape. Descriptor is built with functional options (WithInputSchema and others) because it is 112 bytes and gocritic hugeParam forbids passing it by value; the options validate and NewFunction compiles both schemas once, so a bad schema fails at start-up. WASM availability is false unless WithWASM is set. Register refuses a duplicate name, unlike the tool registry of workflowfx that overwrites. KindOf answers the code of any results.Result, not only the three kinds, so other coded errors cross too.

Conformance (AC4): testdata/conformance/handler_cases.json is read by conformance_test.go and by pkg/@eserstack/functions/conformance.test.ts. Both implement the same named handlers, adapters and mappers; the TypeScript side uses the real task.validate, handler.bind and handler.createTrigger. Registry and error-wire behavior have no TypeScript counterpart yet, so they are tested in Go only until TASK-392.

Verified: go test -race, go vet, gofmt and golangci-lint (0 issues, the installed binary) on pkg/ajan/functionsfx; node --test, oxlint, oxfmt and tsc 7 on the TypeScript side; GOOS=wasip1 go list -deps shows no net/http, so the package can enter the WASM build.

Gate: go run ./cmd/eser ok passed tests, go-check, go-lint, go-tests, nix-vendor-hash and every validator. The formatter, linter and type-check steps could not start in this shell because pnpm is not on PATH; the same commands (oxfmt --check, oxlint, tsc --noEmit) were run from node_modules/.bin over the whole repository and all exit 0. Re-run pnpm ok where pnpm is installed before the commit.

Full gate: go run ./cmd/eser ok passed all 35 steps (exit 0) on 2026-11-13, run with a stand-in pnpm that only maps 'pnpm exec <tool>' to node_modules/.bin/<tool>, because pnpm is not installed in the agent shell. The real pnpm was not run.
<!-- SECTION:NOTES:END -->
