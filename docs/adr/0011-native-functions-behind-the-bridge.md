# Keep the function model in Go and call it from TypeScript

## Status

Accepted on 2026-11-13. The owner set the direction in a conversation on
2026-11-10: the code weight moves to Go, the TypeScript interfaces stay,
TypeScript may call both languages and Go calls Go only. The questions raised
on that day were answered the same day (see Resolved Questions), and the owner
accepted the record on 2026-11-13. The work is tracked in TASK-386 to TASK-395.

## Context and Problem Statement

`@eserstack/functions` holds the function model of the stack in TypeScript:
`Handler<I, O, E, R>` for business logic that does not know how it is invoked,
`Adapter` and `bind` for the trigger side, `Task<T, E, R>` for lazy work with
its requirements in the type, `collect` for middleware pipelines and the
`resources` helpers for cleanup and retry. It has no Go counterpart.

`pkg/ajan/workflowfx` runs the manifest workflows in Go. Its unit of work is a
`WorkflowTool`, a name and a `Run(ctx, map[string]any)`, which is a function in
all but typing and dependency wiring. `@eserstack/workflows` is the TypeScript
twin of that engine; `workflows run` uses the TypeScript engine only
(`pkg/@eserstack/workflows/WIRING.md`).

The bridge in `pkg/@eserstack/ajan` already carries named calls with a JSON
request and an envelope answer, plus streams (`dispatch.go`,
`reactor_protocol.go`). It is host to Go only: Go cannot call back into a
TypeScript function.

The owner wants most of the logic in Go and the TypeScript API unchanged for
people who stay in TypeScript. The questions are where the function model for
Go lives, how `workflowfx`, `@eserstack/functions` and `@eserstack/workflows`
reach it, and how the two models are kept in step.

## Decision Drivers

- A TypeScript user who never touches Go changes nothing: no new dependency,
  no native library load in `@eserstack/functions`.
- Code weight in Go. A function written once in Go serves both languages.
- No third engine. `workflowfx` and `@eserstack/workflows` already exist.
- Every feature of `@eserstack/functions` has a Go counterpart or a recorded
  reason it has none.
- Hexagonal layering: `@eserstack/functions` stays free of the native library;
  callers pass adapters in.
- The bridge ABI stays at its current version if possible.

## Considered Options

1. **A separate `@eserstack/functionsfx` TypeScript package** that wraps the Go
   functions. Rejected by the owner: it adds a package that only forwards
   calls, and splits the TypeScript API in two.
2. **Go calls TypeScript too** (a callback on the bridge). Rejected for now:
   the native and the WASM builds would each need a host callback, and the need
   is covered by letting TypeScript be the only side that calls both.
3. **Go package `functionsfx` plus a native adapter inside
   `@eserstack/functions`** (chosen).

## Decision Outcome

Option 3, in four parts.

**`pkg/ajan/functionsfx`** is the Go function model, paired with
`@eserstack/functions` feature by feature (the table below). A function is a
named `Handler[I, O]` in a registry, with a descriptor: its name, the JSON
Schema of its input and output, and the triggers it serves. Dependencies reach
a handler through its constructor, so the Reader parameter `R` has no Go type.

**`workflowfx`** registers the functions of a `functionsfx` registry as
`WorkflowTool`s. The manifest syntax does not change: a step names a function
like any other tool, and `if`, `loop`, `includes` and `inputSchema` keep
working on it. Go calls Go only.

**The bridge** gets two generic names, `functions.call` (request
`{name, input}`) and `functions.list`, and one stream name for functions that
produce a sequence. A name per function is not used, so the handshake list
stays short and `abiVersion` does not change. The function's error crosses in
the existing envelope with its `kind`.

**`@eserstack/functions/native`** is a new sub-path. It defines the port
`NativeCaller`, a `(name, request) => Promise<envelope>`, and
`fromNative<I, O>(caller, name)`, which returns a `Handler<I, O, E, Cancellable>`.
`AbortSignal` becomes a bridge cancel, the envelope becomes a `Result`, and the
error `kind` becomes the `_tag` of the error. The adapter that implements
`NativeCaller` lives in `@eserstack/ajan`; `@eserstack/functions` imports
nothing from it, and `mod.ts` never loads the native library. The types of
`I` and `O` are generated from the Go structs through their JSON Schema, so Go
is the source of truth. Each function's generated types live in the package
that owns the function, not in `@eserstack/ajan`, so adding a function touches
one package and the bridge package does not grow with the function count.

`@eserstack/workflows` gains two tools for its registry: one that runs a native
function and one that runs a workflow on the Go engine through the bridge's
existing `workflowRun`. The TypeScript engine stays the default.

### Feature pairing

Every row is a requirement: a feature added on one side gets a row, a
counterpart and a conformance fixture, or a reason it has none. "Crosses" means
the feature can be used across the bridge; combinators never cross, because
they operate on closures, and only named handlers and streams do.

| `@eserstack/functions`                                                               | `functionsfx` (Go)                                                                                 | Crosses               |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | --------------------- |
| `Result<T, E>`, `Ok`, `Fail` (`@eserstack/primitives`)                               | `(T, error)`; an error that carries a code is a `results.Result`                                   | As the envelope       |
| `run`, `runSync`                                                                     | None: early return is Go's do-notation                                                             | No                    |
| `Task<T, E, R>`                                                                      | `Task[T]`, a `func(ctx) (T, error)`; `R` is constructor injection                                  | No                    |
| `task`, `succeed`, `failTask`, `map`, `flatMap`, `flatMapW`                          | `NewTask`, `Succeed`, `Fail`, `Map`, `Then`                                                        | No                    |
| `fromPromise`                                                                        | None: Go has no promise                                                                            | No                    |
| `all`, `allPar`                                                                      | `All`, `AllPar` (bounded, cancels siblings on the first error)                                     | No                    |
| `provideContext`                                                                     | None: the constructor provides it                                                                  | No                    |
| `Cancellable`, `withAbort`                                                           | `context.Context`, `WithTimeout`                                                                   | Signal becomes cancel |
| `Observable`, `withLogging`                                                          | `logfx.Logger`, `WithLogging`                                                                      | No                    |
| `validate`, `ValidationError`                                                        | `Validate`, an error of kind `ValidationError`                                                     | Kind crosses          |
| `AbortError`, `AdaptError`                                                           | Errors of kind `AbortError` and `AdaptError`                                                       | Kind crosses          |
| `Handler<I, O, E, R>`                                                                | `Handler[I, O]`                                                                                    | Yes, by name          |
| `Adapter`, `AdaptError`, `bind`, `ResponseMapper`, `TriggerBinding`, `createTrigger` | `Adapter[Ev, I]`, `Bind`, `ResponseMapper`, `TriggerBinding`, `NewTrigger`                         | No                    |
| `HttpEvent`, `HttpResponse`                                                          | Adapter over `httpfx`                                                                              | Via the HTTP server   |
| `CliEvent`                                                                           | Adapter over `clifx`                                                                               | No                    |
| `CronEvent`                                                                          | Adapter over `workerfx`                                                                            | No                    |
| `ToolCallEvent`, `ToolCallResponse`                                                  | Adapter over `aifx.ToolCall` (the TypeScript fields already follow it)                             | By name               |
| `QueueEvent`, `QueueAction`                                                          | Types only: no Go queue package exists                                                             | No                    |
| `collect`, `Pipeline`, `Context`, `State`, `use`, `mapError`, `recover`              | `Pipeline[T]` with `Use`, `MapError`, `Recover` over `iter.Seq2`; `streamfx` adapters at both ends | No                    |
| `iterate`, `run`, `runFirst`, `runLast`                                              | `Iterate`, `Run`, `RunFirst`, `RunLast`                                                            | `iterate` as a stream |
| `bracket`, `using`, `bracketWithReleaseError`                                        | `Bracket`, `BracketWithReleaseError`                                                               | No                    |
| `createScope`, `scoped`, `acquireRelease`, `ensure`, `Scope`                         | `NewScope`, `Scoped`, `AcquireRelease`, `Ensure` (LIFO finalizers)                                 | No                    |
| `retry`, `retryWithBackoff`, `withRetry`                                             | `Retry`, `RetryWithBackoff`, `WithRetry`                                                           | No                    |
| `withTimeout`                                                                        | `WithTimeout` on the context                                                                       | No                    |

Pairing is checked by shared conformance fixtures: JSON files of inputs and
expected outputs that a Go test and a TypeScript test both run. The pattern is
in use for the HTTP retry policy (`pkg/ajan/httpclient/resilience`).

### Existing Go packages the pairing reuses

- `pkg/ajan/results` is a coded result occurrence (`Definition`, kind, code),
  not a generic `Result[T, E]`. It stays the error value; `functionsfx` adds no
  second result type.
- `pkg/ajan/streamfx` is a source, layers and a sink over `Chunk` channels. It
  has no `next()` and no shared state, so it does not replace `Pipeline[T]`;
  it is connected to it.
- `pkg/ajan/workerfx` is the interval worker behind the cron trigger.
- `pkg/ajan/httpclient/resilience` holds `RetryStrategy.NextBackoff`, the
  exponential backoff with jitter. The package does not import `net/http` (it
  was split out of `httpclient` for the `wasip1` build), so `functionsfx` can
  import it without linking the HTTP client. `Retry` and `RetryWithBackoff`
  use it with `RandomFactor` 0 by default, so the delays equal those of
  `retryWithBackoff` in `resources.ts`. Two differences need a fixture each:
  the TypeScript first delay is not capped by `maxDelay` and the Go one is,
  and the Go strategy stops at `MaxAttempts` by returning a zero delay.
  The HTTP-specific part, `RetryPolicy` with its statuses and `Retry-After`,
  stays where it is.

## Consequences

Easier:

- A function written once in Go runs from a manifest step, from TypeScript and
  from a Go service, with one input and output schema.
- TypeScript users keep `@eserstack/functions` exactly as it is; the native
  path is opt-in through a sub-path.
- The pairing table gives reviewers one place to see what is missing on a side.

Harder:

- Two implementations of the combinators exist, one per language, and the
  fixtures are what keeps them equal.
- Closures cannot cross the bridge, so a TypeScript pipeline cannot hand a
  middleware to Go; chaining across languages goes through named functions.
- A generator for the TypeScript types from the Go structs has to be kept
  working in the gate.
- The WASM profile has no network of its own (the `eser_host` imports cover
  HTTP and sleep only), so a descriptor must say whether a function runs
  there.
- Calling a TypeScript function from Go stays impossible. A workflow that needs
  one runs on the TypeScript engine.

## Resolved Questions

Answered on 2026-11-10; the owner may still change them while this ADR is
Proposed.

- **Where does the retry backoff live?** In `httpclient/resilience`, which
  `functionsfx` imports (owner's answer). See "Existing Go packages" above.
- **Where do the generated TypeScript types live?** In the package that owns
  each function (owner's answer), so the stack scales by package.
- **Does `Pipeline[T]` hold its own chain or sit on `streamfx`?** Its own
  chain, connected to `streamfx` at both ends: the shapes differ (`next()` and
  shared state against source, layers and sink).
- **Which functions come first?** The `validate-*` tools of
  `pkg/ajan/codebasefx/validatortools`. They are already `WorkflowTool`s that
  `workflowfx` runs, the eser CLI already reaches them through the bridge, and
  they take a root and options and answer issues, so they exercise the input
  and output schemas, the workflow call and the TypeScript call with real
  work. The shell tool and the file tools follow: their typed input and output
  are thinner, and the shell tool has no place in the WASM profile.

## Amendments

The decision above stands. These notes record what building TASK-391 showed
about its details; the text above is left as accepted.

**2026-11-13, bridge names.** The reactor protocol reserves names that hold a
dot for its stream operations (`stream.open`, `stream.read`, `stream.close`,
`pkg/@eserstack/ajan/reactor_protocol.go`), so no registry name can hold one.
The two generic names are `functionCall` and `functionList`, in the camelCase of
every other bridge name, not `functions.call` and `functions.list`. The request
of `functionCall` is `{ name, input, requestId? }` and the answer is
`{ output }` or `{ error, errorKind }`, the shape the AI answers already use.
A call is cancelled through the existing `requestId` and `aiCancelRequest`
protocol, not a new one.

**2026-11-13, WASM profile.** The bridge serves both names on the native
library only. Schema validation links `jsonschema` into the module, which
measured +1.7 MB on the WASM profile (8,093,348 to 9,815,465 bytes, +21%), and
`make ajan-wasm-check` limits that profile to 8,000,000 bytes: the profile was at
7,906,884. No function has to run there yet, so the profile answers
`UNSUPPORTED_IN_WASM` for both names, like for any name it leaves out. The
`WASM` field of a descriptor stays; the first function that must run in the
profile brings the names with it and a size decision.

**2026-11-13, streams.** The stream name for functions that produce a sequence
waits for the Go type of such a function, which `Pipeline[T]` (TASK-388)
defines. It is TASK-396, done on 2026-11-14 (see below).

**2026-11-14, generated types.** The types of a native function are written by
`go run ./cmd/eser codebase native-types` from the schemas of its descriptor.
A function names its owner package with `functionsfx.WithOwner`, and the module
`native-functions.ts` of that package holds the input and output types of every
function it owns, so adding a function touches its owner and no central file.
`functionsfx.SchemaOf` derives a schema from a Go struct (`WithSchemasOf[I, O]`),
and a function whose input is not a struct, like the validators, writes its
input schema in Go; either way the Go side is the source. The list of functions
is `pkg/ajan/nativefx`, which the bridge registers and the generator reads, so
what TypeScript has types for is what the bridge serves. The precommit workflow
runs the command with `--check` (the step `native-function-types` of
`.eser/manifest.yml`), so a Go change that leaves the types behind fails the
gate, and `eser fix` writes them. The output is the text the repository's
formatter produces, so the formatter step passes on it.

**2026-11-14, streams.** A function that answers a sequence is a
`functionsfx.StreamFunction`, built with `NewStreamFunction` from a handler that
returns an `iter.Seq2`, and its descriptor says `stream`. It is opened, not
called: `Call` answers `ErrStreamOnly`, and `Registry.Stream` gives its items.
The bridge serves it as one stream name, `functionStream`, in the existing
dispatcher ABI (version 3): open takes `{ name, input }` and checks the input
before anything is produced, each read answers `{ output }` for an item or
`{ error, errorKind }` as the last item and then null, and closing the stream
ends the context the function runs on, so a function that honors its context
stops. The producer waits for the reader (one item of buffer), so a slow reader
slows the function, and at most 1024 streams are open at once. TypeScript reaches
it with `streamFunction` of `@eserstack/ajan/ffi/functions`, and
`fromNativeStream` of `@eserstack/functions/native` gives the items as `Result`s
a `collect` pipeline can `yield*`. The generated types mark such a function with
`readonly stream: true`. The WASM profile does not serve the name, for the reason
given above.

**2026-11-14, the first stream and the CLI wiring.** `workflow-steps`
(`pkg/ajan/nativefx`, owned by `@eserstack/workflows`) is the first function that
streams. It takes the text of a manifest, the id of a workflow and the options of
`workflowRun`, runs the workflow on the Go engine in a goroutine of its own and
answers each step as it ends, so a caller sees progress instead of waiting for
the whole run. A failed step is an item and the run goes on, as it does in the
engine; a workflow or step filter the manifest does not have is a
`ValidationError`. A reader that stops, or a signal that aborts, cancels the run
and waits for it, so no step outlives the stream. Mutations are reported and not
applied. The eser CLI now registers `native-function` and `go-workflow` itself
(`pkg/@eserstack/cli/native-tools.ts`), so the steps of a manifest can name them;
the ports load the native library on the first call only. The Go `eser` needs
nothing: its workflows already run on the Go engine, where the functions are
tools by their own names.

**2026-11-14, typed calls.** `fromNativeOf<NativeFunctions>(caller)(name)` and
`fromNativeStreamOf<NativeFunctions>(caller)(name)` of
`@eserstack/functions/native` read the input and output of a function from the
generated map, so a call is checked against the Go function: an unknown name,
the name of a function that streams (for `fromNativeOf`) or answers once (for
`fromNativeStreamOf`), and an input of the wrong shape fail to compile. The map
comes first and the name second because a type argument cannot be given in part.
`fromNative` and `fromNativeStream` stay for a function the map does not
describe.

## Links

- `pkg/@eserstack/functions/`: the TypeScript model this pairs with.
- `pkg/ajan/workflowfx/`: the Go engine that calls the functions.
- `pkg/@eserstack/workflows/WIRING.md`: the current state of the two engines.
- `pkg/@eserstack/ajan/dispatch.go`: the bridge calls and the envelope.
- ADR 0005, `0005-leave-deno-for-node-and-go.md`: the Node and Go direction.
- Backlog milestone m-6: remaining business logic moves to Go behind the
  bridge.
