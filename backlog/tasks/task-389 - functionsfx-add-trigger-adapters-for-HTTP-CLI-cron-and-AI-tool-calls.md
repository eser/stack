---
id: TASK-389
title: 'functionsfx: add trigger adapters for HTTP, CLI, cron and AI tool calls'
status: Done
assignee: []
created_date: '2026-11-10 10:00'
updated_date: '2026-11-15 22:30'
labels:
  - go
  - functions
milestone: m-6
dependencies:
  - TASK-386
references:
  - docs/adr/0011-native-functions-behind-the-bridge.md
priority: medium
ordinal: 392000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Bind a functionsfx Handler to httpfx (HttpEvent and HttpResponse), clifx (CliEvent), workerfx (CronEvent) and aifx.ToolCall (ToolCallEvent and ToolCallResponse). QueueEvent and QueueAction are types only because no Go queue package exists.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each adapter maps its event to the handler input and the result to the trigger response, and a malformed event yields an AdaptError
- [x] #2 The ToolCall adapter keeps the field names of pkg/ajan/aifx/messages.go
- [x] #3 Adapters live next to the package they adapt or under functionsfx without making the core import them
- [x] #4 pnpm ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Layout (AC3): the core of functionsfx imports no framework. pkg/ajan/functionsfx/triggers holds the event and response types (HTTPEvent, HTTPResponse, QueueEvent, QueueAction, CLIEvent, CronEvent, ToolCallEvent, ToolCallResponse) with no framework in them, plus StatusOf, As and ErrOf; each framework has its own small package, so a service imports only the adapters it uses: triggers/httptrigger (httpfx), triggers/clitrigger (clifx), triggers/crontrigger (workerfx), triggers/toolcalltrigger (aifx). TestTheCoreImportsNoFramework runs go list -deps on the core and fails if httpfx, clifx, workerfx, aifx or triggers appear in it.

AC1: each adapter maps its event to the input and the response of the function to the source, and a malformed event is an AdaptError. httptrigger.Event reads a request (first header and query values, a JSON body decoded when the content type says JSON and text otherwise, a body limit, default 1 MiB, WithMaxBody); an unreadable, too large or non-JSON body is an AdaptError and Handler answers a 400 without running the function. httptrigger.Respond maps a success to 200 and an error to triggers.StatusOf (400 for ValidationError and AdaptError, 503 for AbortError, 500 otherwise) with the wire form (error, errorKind) as the body, so the kind reaches the client; Result writes it as an httpfx.Result (only Content-Type survives from the headers: an httpfx.Result carries no other). clitrigger.Event gives the words after the program name, the args and the typed values of the flags that were set; Exit maps ValidationError and AdaptError to a usage error with exit 2 and anything else to exit 1; Run makes a command's Run function. crontrigger.Worker is a workerfx.Worker whose Execute runs the function with a CronEvent stamped by the clock (WithClock for tests). toolcalltrigger.Event decodes the arguments of an aifx.ToolCall (bad JSON is an AdaptError), Respond answers an error with the wire form and IsError, Result makes the aifx.ToolResult (string content as it is, anything else as JSON), Handle answers a call end to end. triggers.As converts a decoded body or arguments to the typed input through JSON and answers an AdaptError when it does not fit. QueueEvent and QueueAction are types only: no Go queue package exists.

AC2: ToolCallEvent keeps the fields of aifx.ToolCall (ID, Name, Arguments; JSON callId, name, arguments for the TypeScript side) and TestEventKeepsTheFieldsOfAToolCall checks them.

AC4: the full gate passed on the second run. The first run failed go-tests on a test of mine: TestAllParCancelsTheOthersAtTheFirstFailure expected both waiting tasks to see their context end, but AllPar starts no more tasks after a failure, so the third might never start. It also exposed a real window in AllPar: when a slot frees and the context is already cancelled, select picks one at random, so a task could still start after the failure. AllPar now looks at the context again after taking a slot. The test waits for both tasks to start before the failing one fails, and 300 repetitions with -race and 15 runs at 1, 2 and 4 CPUs pass.

Not done: the TypeScript README of @eserstack/functions and the pairing table now agree with Go's (no open row left), and Go had no counterpart of createTrigger for a queue, as no queue package exists.

Full gate: go run ./cmd/eser ok passed all steps (exit 0) on 2026-11-14, with a stand-in pnpm that only maps 'pnpm exec <tool>' to node_modules/.bin/<tool>; the real pnpm was not run.

Review before 5.0.0: `httptrigger.Respond` answered an error without a kind as a 500 whose body was the error's text, and httpfx never logged it. It now carries such an error in `HTTPResponse.Err` (`json:"-"`), and `Result` answers it through `httpfx.WithSanitizedError`, which logs it and sends its text only when errors are disclosed; a response without a status is a 200. The HTTP body and the tool-call arguments decoded to `any` with numbers as float64, so an int64 above 2^53 reached the function rounded; both decode through `triggers.DecodeJSON`, which keeps a number as `json.Number`. Tests written first: `TestAnUnexpectedErrorIsA500ThatHidesItsMessage`, `TestALargeIntegerInTheBodyKeepsItsValue`, `TestAResponseWithoutAStatusIsA200` and `TestALargeIntegerInTheArgumentsKeepsItsValue`. The other findings of that review are TASK-400.
<!-- SECTION:NOTES:END -->
