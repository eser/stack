# 🧩 [ajan/functionsfx](./)

> **eserstack Go library** in the root module `github.com/eser/stack`. Import
> `github.com/eser/stack/pkg/ajan/functionsfx`. The module is not published for
> `go get`: build inside this repository, or require `github.com/eser/stack`
> with a `replace` directive that points at a checkout.

**functionsfx** is the Go function model of the stack. A function is business
logic that does not know how it is invoked: a typed handler with a name, a
description and JSON Schemas. Adapters bind it to triggers, a registry names it,
and its errors carry a kind that survives the bridge to TypeScript.

It pairs feature by feature with
[`@eserstack/functions`](../../@eserstack/functions/README.md). The reasons and
the decisions are in
[ADR 0011](../../../docs/adr/0011-native-functions-behind-the-bridge.md).

## Key Features

- `Handler[I, O]`, `Task[T]` and `Adapter[Ev, I]` as plain function types
- `Bind` and `NewTrigger` to run a handler from a trigger event
- The combinators of `task.ts` and the helpers of `resources.ts`: `Map`, `Then`,
  `All`, `AllPar`, `Validate`, `WithTimeout`, `WithLogging`, `Retry`,
  `RetryWithBackoff`, `Bracket`, `Scope` and `Ensure`
- `Pipeline[T]`, a chain of middleware over `iter.Seq2` that connects to `streamfx`
- A `Registry` of named `Function`s that are called with JSON, the input checked
  against the descriptor's JSON Schema
- Errors with a kind (`ValidationError`, `AbortError`, `AdaptError`) built on
  `pkg/ajan/results`, with `KindOf`, `MessageOf` and the wire form `WireError`
- Shared conformance fixtures that a Go test and a TypeScript test both run

## Quick Start

This registers a function that greets by name, then calls it with JSON the way
the workflow engine and the bridge do:

```go
package main

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/eser/stack/pkg/ajan/functionsfx"
)

type greetInput struct {
	Name string `json:"name"`
}

func main() {
	greet, err := functionsfx.NewFunction("greet",
		functionsfx.Handler[greetInput, string](
			func(_ context.Context, input greetInput) (string, error) {
				return "Hello, " + input.Name, nil
			}),
		functionsfx.WithDescription("Greets by name"),
		functionsfx.WithInputSchema(json.RawMessage(`{
			"type": "object",
			"properties": {"name": {"type": "string", "minLength": 1}},
			"required": ["name"]
		}`)),
		functionsfx.WithTriggers(functionsfx.TriggerHTTP, functionsfx.TriggerToolCall),
	)
	if err != nil {
		panic(err)
	}

	registry := functionsfx.NewRegistry()
	if err := registry.Register(greet); err != nil {
		panic(err)
	}

	out, err := registry.Call(context.Background(), "greet", json.RawMessage(`{"name":"Ada"}`))
	fmt.Println(string(out), err) // "Hello, Ada" <nil>

	_, err = registry.Call(context.Background(), "greet", json.RawMessage(`{}`))
	fmt.Println(functionsfx.KindOf(err), functionsfx.MessageOf(err)) // ValidationError ...
}
```

A call with an input the schema refuses never reaches the handler: it answers a
`ValidationError`. A cancelled context answers an `AbortError`. Any other error
is the handler's own and comes back as it is.

## Dependencies reach a handler through its constructor

TypeScript declares what a task needs in its type (`Task<T, E, R>`). Go has no
`R`. A handler that needs a store or a logger is a method of a struct that holds
them, and the method value is the `Handler`:

```go
type orders struct {
	store OrderStore
}

func (o *orders) Create(ctx context.Context, input CreateOrder) (Order, error) {
	return o.store.Insert(ctx, input)
}

create := functionsfx.Handler[CreateOrder, Order](o.Create)
```

## Pairing with @eserstack/functions

Every row is a requirement: a feature added on one side gets a row. "Crosses"
means the feature can be used across the bridge; only named functions do, since
combinators work on closures.

| `@eserstack/functions`                                                                       | `functionsfx`                                                                                                            | Where                                           |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `Result<T, E>`, `Ok`, `Fail`                                                                 | `(T, error)`; a coded error is a `results.Result`                                                                        | here                                            |
| `Handler<I, O, E, R>`                                                                        | `Handler[I, O]`, with the `Task` folded into the call                                                                    | here                                            |
| `Task<T, E, R>`, `runTask`                                                                   | `Task[T]`, `Task.Run`                                                                                                    | here                                            |
| `succeed`, `failTask`                                                                        | `Succeed`, `Fail`                                                                                                        | here                                            |
| `task` (the constructor)                                                                     | None: `Task[T](fn)` is a conversion                                                                                      | no counterpart needed                           |
| `fromPromise`                                                                                | None: Go has no promise                                                                                                  | no counterpart needed                           |
| `run`, `runSync`                                                                             | None: early return is Go's do-notation                                                                                   | no counterpart needed                           |
| `provideContext`                                                                             | None: the constructor provides the dependencies                                                                          | no counterpart needed                           |
| `Adapter`, `bind`                                                                            | `Adapter[Ev, I]`, `Bind`                                                                                                 | here                                            |
| `AdaptError`, `adaptError`                                                                   | `NewAdaptError`, kind `AdaptError`                                                                                       | here                                            |
| `ResponseMapper`, `TriggerBinding`, `createTrigger`                                          | `ResponseMapper`, `TriggerBinding`, `NewTrigger`                                                                         | here                                            |
| `ValidationError`                                                                            | `NewValidationError`, kind `ValidationError`                                                                             | here                                            |
| `AbortError`                                                                                 | `NewAbortError`, kind `AbortError`; a cancelled context reads the same                                                   | here                                            |
| `Cancellable` (`AbortSignal`)                                                                | `context.Context`                                                                                                        | here; the signal becomes a cancel at the bridge |
| `validate`                                                                                   | `Validate`                                                                                                               | here                                            |
| `map`, `flatMap`, `flatMapW`, `all`, `allPar`                                                | `Map`, `Then`, `All`, `AllPar`                                                                                           | here                                            |
| `withAbort`, `withTimeout`                                                                   | `WithTimeout` (the signal is the context)                                                                                | here                                            |
| `withLogging`                                                                                | `WithLogging`                                                                                                            | here                                            |
| `withRetry`, `retry`                                                                         | `Retry` (a `Task` is the function `retry` takes)                                                                         | here                                            |
| `retryWithBackoff`                                                                           | `RetryWithBackoff`, delays from `httpclient/resilience`                                                                  | here                                            |
| `bracket`, `using`                                                                           | `Bracket`                                                                                                                | here                                            |
| `bracketWithReleaseError`                                                                    | `BracketWithReleaseError`                                                                                                | here                                            |
| `createScope`, `scoped`, `acquireRelease`, `ensure`                                          | `NewScope`, `Scoped`, `AcquireRelease`, `Ensure` (LIFO finalizers)                                                       | here                                            |
| `collect`, `Pipeline`, `use`, `mapError`, `recover`, `iterate`, `run`, `runFirst`, `runLast` | `NewPipeline`, `Pipeline[T]` over `iter.Seq2` with `Use`, `MapError`, `Recover`, `Iterate`, `Run`, `RunFirst`, `RunLast` | here                                            |
| `Context` (`state`, `next`), `Middleware`                                                    | `Step` (`State`, `Next`), `Middleware[T]`; `Emit` and `FailWith` for a one-item middleware                               | here                                            |
| `HttpEvent`, `HttpResponse`                                                                  | `triggers.HTTPEvent`, `triggers.HTTPResponse`, bound to httpfx by `httptrigger`                                          | here                                            |
| `CliEvent`                                                                                   | `triggers.CLIEvent`, bound to clifx by `clitrigger`                                                                      | here                                            |
| `CronEvent`                                                                                  | `triggers.CronEvent`, bound to workerfx by `crontrigger`                                                                 | here                                            |
| `ToolCallEvent`, `ToolCallResponse`                                                          | `triggers.ToolCallEvent`, `triggers.ToolCallResponse`, bound to aifx by `toolcalltrigger`                                | here                                            |
| `QueueEvent`, `QueueAction`                                                                  | `triggers.QueueEvent`, `triggers.QueueAction`: types only, no Go queue package exists                                    | here                                            |

## Where the two models differ

The shared fixtures (`testdata/conformance/task_cases.json`) hold every case both
languages agree on. These are the places they differ on purpose, each with a case
that says so or a test of its own:

- `AllPar` is bounded (`WithParallelism`, default `DefaultParallelism`) and
  cancels the context of the others at the first failure, so it answers the first
  failure in time. `allPar` runs everything and answers the first in order.
- `RetryWithBackoff` caps the wait after the first failure by `MaxDelay`;
  `retryWithBackoff` does not, so an `InitialDelay` above `MaxDelay` waits
  `MaxDelay` in Go and `initialDelay` in TypeScript. A fixture holds both. A
  `Backoff` with `MaxAttempts` 0 makes `DefaultBackoffAttempts` attempts, where
  `maxAttempts: 0` is none in TypeScript; use a negative number for none.
- `WithTimeout` stands for `withAbort` and `withTimeout`: Go's cancellation is the
  context, so there is no signal to pass, and a timeout is always an `AbortError`.
  A task that ignores its context is abandoned at the deadline, as `withAbort`
  leaves it.
- `Scoped` joins a failed close to the error of the task, and `Ensure` joins a
  failed finalizer to it; TypeScript lets the throw of the finalizer replace the
  result.
- A `Pipeline` is its own chain, not a layer on `streamfx`: its shape, middleware
  that delegate with `Next` and share a state, is not a source, layers and a sink.
  It connects at both ends: `FromStream` is a middleware that emits what a
  `streamfx.Source` produces, and `AsSource` and `Into` give the chain to a
  `streamfx.Source` or run it into a `streamfx.Sink`. A failure reaches the stream
  as a signal chunk with the annotation `error`.
- A middleware always returns a sequence; TypeScript lets it return one result or
  a promise of one, which `Emit` and `FailWith` cover. A second `Next` is a
  failure item (`ErrNextCalledMultipleTimes`) where TypeScript throws, so Go's
  `Recover` and `MapError` see it and TypeScript's do not. The context ends a run
  with a failure item, which `collect` has no way to do.
- Release functions take no context: a release runs when the use ended, often
  because the context did.

## Functions that stream

A function that answers a sequence is built with `NewStreamFunction` from a
`StreamHandler`, which returns an `iter.Seq2` of values and errors, as
`Pipeline.Iterate` does. Its descriptor says `Stream`, and its output schema
describes one item:

```go
count, err := functionsfx.NewStreamFunction("count-up",
	functionsfx.StreamHandler[CountInput, int](func(ctx context.Context, input CountInput) iter.Seq2[int, error] {
		return func(yield func(int, error) bool) {
			for i := 1; i <= input.To && ctx.Err() == nil; i++ {
				if !yield(i, nil) {
					return
				}
			}
		}
	}),
	functionsfx.WithOwner("@eserstack/greeter"),
)

items, err := registry.Stream(ctx, "count-up", json.RawMessage(`{"to":3}`))
for value, err := range items {
	// value is the JSON of an item; a failure of the function is the last item
}
```

It is opened, not called: `Call` answers `ErrStreamOnly`, and `Open` checks the
input first, so a refused input is the error of `Open` before anything is
produced. Stop ranging and the producer stops, and a handler checks `ctx.Err()`
for work that does not reach a `yield`. Through the bridge a function that
streams is the stream name `functionStream`.

## Triggers

A function is written once as a `Handler`, and a trigger binding turns an event of
one source into its input and its output or error into the response of that
source, as `bind` and `createTrigger` do in TypeScript. The event and response
types are in `functionsfx/triggers`, and each framework has a small package that
binds them, so the core imports no framework and a service imports the adapters
it uses:

| Source       | Package                           | Event                                         | Response                                      |
| ------------ | --------------------------------- | --------------------------------------------- | --------------------------------------------- |
| HTTP         | `triggers/httptrigger` (httpfx)   | the request, as `HTTPEvent`                   | `HTTPResponse`, written as an `httpfx.Result` |
| Command line | `triggers/clitrigger` (clifx)     | the words, arguments and flags, as `CLIEvent` | the `error` of the command                    |
| Schedule     | `triggers/crontrigger` (workerfx) | each run, as `CronEvent`                      | the `error` of the run                        |
| AI tool call | `triggers/toolcalltrigger` (aifx) | an `aifx.ToolCall`, as `ToolCallEvent`        | an `aifx.ToolResult`                          |

```go
trigger, err := functionsfx.NewTrigger(functionsfx.TriggerBinding[triggers.HTTPEvent, triggers.HTTPResponse, CreateOrder, Order]{
	Handler: createOrder,
	AdaptInput: func(event triggers.HTTPEvent) (CreateOrder, error) {
		return triggers.As[CreateOrder](event.Body)
	},
	AdaptOutput: httptrigger.Respond[Order],
})

router.Route("POST /orders", httptrigger.Handler(trigger))
```

An event that cannot become input is an `AdaptError` and the function does not
run: a request body that is not JSON or is too large, tool-call arguments that are
not JSON, or a value `triggers.As` cannot fit to the input type. Each source
answers it its own way: HTTP with a 400, a command with a usage error and exit 2,
a tool call with an error result. The response maps the kind of an error, so HTTP
answers 400 for a `ValidationError` or an `AdaptError`, 503 for an `AbortError`
and 500 otherwise, and carries the wire form of the error (`error` and
`errorKind`) as its body. An HTTP response keeps only its `Content-Type` header,
because an `httpfx.Result` carries no other. `QueueEvent` and `QueueAction` are
types only: no Go queue package exists to bind them to.

## Running a function as a workflow step

`workflowfx.RegisterFunctions(tools, functions)` registers every function of a
registry as a workflow tool under its name, so a manifest step names a function
like any other tool and `if`, `loop`, `includes` and `inputSchema` work on it.
The manifest syntax does not change.

The input of the function is the merged options of the step: the ones the
manifest gives and the ones the engine adds (`root`, `fix`, `dryRun`, `_args`,
`_changedFiles`). A function takes the fields it needs, so its input type or
schema must not forbid additional properties. A function that declares
`TriggerWorkflow` answers a `workflowfx.ToolOutput` (`passed`, `issues`,
`mutations`, `stats`), which fills the result of the step; any other function
passes its step and its output is `stats.output`.

A `ValidationError` or an `AdaptError` fails the step with its message and lets
the run go on. Any other error stops the run unless the step sets
`continueOnError`.

## TypeScript types

The Go function is the source of the TypeScript types a caller gives
`fromNative`. A function names the package that owns it, and
`go run ./cmd/eser codebase native-types` writes `native-functions.ts` into that
package, with the input and output type of every function it owns:

```go
function, err := functionsfx.NewFunction("greet", handler,
	functionsfx.WithOwner("@eserstack/greeter"),
	functionsfx.WithSchemasOf[GreetInput, GreetOutput](),
)
```

`SchemaOf[T]` reads a Go struct the way `encoding/json` does: the `json` tag
names a field, `omitempty` and `omitzero` make it optional, a pointer without
`omitempty` is nullable, and a `description:"text"` tag becomes a comment. A
function whose input is not a struct writes its schema with `WithInputSchema`.
The functions the bridge serves are listed in `pkg/ajan/nativefx`, which the
generator reads.

The precommit workflow runs `native-types --check`, so a change to a Go function
that leaves its types behind fails the gate, and `eser fix` rewrites them. Do not
edit a generated file: its header says so, and the next run replaces it.

## Errors and the bridge

`KindOf` answers the code of the `results.Result` an error carries, `KindAbort`
for a cancelled or timed out context, and `KindUnknown` otherwise. `MessageOf`
answers the text of the cause inside that result. `ToWire` joins the two as
`WireError`, which encodes as `{"error": "...", "errorKind": "..."}`: the shape
of the error answers the bridge already uses, where an object with an `error`
string fails the dispatcher envelope and `errorKind` rides along in its result.
TypeScript reads the kind as the `_tag` of its error.

## Conformance fixtures

`testdata/conformance/handler_cases.json` holds cases that both languages run:
`conformance_test.go` here and `conformance.test.ts` in `@eserstack/functions`.
Each side implements the same named handlers, adapters and mappers, so a case
that passes on both shows that `Bind`, `NewTrigger` and the error kinds behave
the same. Add a case to the file when you add a feature to the pairing table;
change a case on one side only and the other side's test fails.

## Not in this package

- The bridge names are `functionCall` and `functionList` (ADR 0011, amendments).
- Calling a TypeScript function from Go does not exist and is not planned: Go
  calls Go only (ADR 0011).
