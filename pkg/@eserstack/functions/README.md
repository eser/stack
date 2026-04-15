# ⚡ [@eserstack/functions](./)

> **eserstack Foundation** —
> [eser/stack on GitHub](https://github.com/eser/stack) **Install:**
> `pnpm add jsr:@eserstack/functions`

Higher-level workflow compositions for the eserstack ecosystem.

## Vision

`@eserstack/functions` provides the **orchestration patterns** that compose
primitive operations into real-world workflows. Where `@eserstack/fp` gives you
individual steps, `@eserstack/functions` gives you the choreography — multi-step
operations, middleware pipelines, lazy computation, and resource lifecycle
management.

## Design Philosophy

- **Workflows, not primitives.** Types and combinators live in
  `@eserstack/primitives`. This package provides the patterns that tie them
  together.
- **Generator-based composition.** `run()` uses generators for monadic
  do-notation — `yield*` unwraps Results, short-circuiting on failure.
- **Middleware pipelines.** `collect()` provides Koa-style middleware chains
  with `ctx.next()` delegation.
- **Lazy computation.** `Task<T, E, R>` wraps
  `(ctx: R) => Promise<Result<T, E>>` — nothing executes until you call
  `runTask()`. The `R` parameter enables context threading (Reader monad
  pattern).
- **Trigger adapters.** `Handler` + `Adapter` implements the Ports & Adapters
  pattern — define business logic once, invoke from HTTP, queue, CLI, or cron.
- **Safe resource management.** `bracket`, `scoped`, and `acquireRelease`
  guarantee cleanup with LIFO finalizer ordering.

## How It Fits

```
@eserstack/primitives  →  @eserstack/fp  →  @eserstack/functions
   (types +           (pure FP      (this package)
    constructors)      combinators)   higher-level
                                      compositions)
```

- **vs `@eserstack/fp`**: fp is `map(result, fn)` — one step. Functions is
  `run(function*() { ... })` — many steps composed into workflows.
- **vs Effect.ts**: Lightweight, no runtime, no fibers. Our `Task<T, E, R>`
  mirrors Effect's `Effect<A, E, R>` three-parameter design for context
  threading, but at 5% of the complexity.

## Quick Start

```typescript
import * as functions from "@eserstack/functions";
import * as results from "@eserstack/primitives/results";

// Monadic do-notation
const result = await functions.run(async function* () {
  const user = yield* fetchUser(1);
  const posts = yield* fetchPosts(user.id);
  return { user, posts };
});

// Pattern matching
results.match(result, {
  ok: (value) => console.log(`Got ${value.posts.length} posts`),
  fail: (error) => console.error(`Error: ${error}`),
});
```

## functions.run() / functions.runSync() — Monadic Composition

Use when you need **sequential operations with access to intermediate values**:

```typescript
import * as functions from "@eserstack/functions";
import * as results from "@eserstack/primitives/results";

// Async monadic composition (do-notation)
const fetchUserWithPosts = (userId: number) =>
  functions.run(async function* () {
    const user = yield* fetchUser(userId); // Unwrap Result, get value
    const posts = yield* fetchPosts(user.id); // Use user.id!
    return { user, posts }; // Compute final result
  });

const result = await fetchUserWithPosts(1);
// result: Result<{ user: User, posts: Post[] }, Error>

// Sync version
const parseConfig = (input: string) =>
  functions.runSync(function* () {
    const json = yield* parseJson(input); // Unwrap Result
    const port = yield* validatePort(json.port); // Use json!
    return { port, host: json.host };
  });

// Short-circuits on first failure
const computed = functions.runSync(function* () {
  const a = yield* results.ok(5);
  const b = yield* results.fail("error"); // Stops here
  return a + b; // Never reached
});
// computed: results.fail("error")
```

## functions.collect() — Middleware/Streaming Pattern

Koa-style middleware chains for streaming results with before/after hooks:

```typescript
import * as functions from "@eserstack/functions";
import * as results from "@eserstack/primitives/results";

const pipeline = functions.collect<string, Error>()
  .use(async function* (ctx, name: string) {
    // Logging middleware
    console.log("Before:", name);
    yield* ctx.next(); // Delegate to next
    console.log("After");
  })
  .use(async function* (_ctx, name: string) {
    // Handler - emit results
    yield results.ok(`Hello, ${name}!`);
  });

// Run and collect all results
const result = await pipeline.run("World");
// result: ok(["Hello, World!"])

// Or iterate one by one
for await (const item of pipeline.iterate("World")) {
  console.log(item);
}

// Error handling in pipelines
const withRecovery = functions.collect<number, string>()
  .use(() => results.fail("error"))
  .recover((_error) => results.ok(0)); // Recover from errors
```

## functions.task.* — Lazy Computation

`Task<T, E, R>` wraps a `(ctx: R) => Promise<Result<T, E>>` — the computation
doesn't execute until you call `runTask()`. Composable with retry, timeout,
cancellation, and observability. See also:
[Context-Aware Tasks](#-context-aware-tasks-reader-pattern) for dependency
injection and cancellation.

```typescript
import * as functions from "@eserstack/functions";

const { task } = functions;

// Create tasks
const fetchData = task.fromPromise(() =>
  fetch("/api/data").then((r) => r.json())
);
const constant = task.succeed(42);

// Compose
const transformed = task.map(fetchData, (data) => data.items);
const chained = task.flatMap(fetchData, (data) => fetchDetails(data.id));

// Error type widening
const widened = task.flatMapW(fetchData, (data) => parseData(data));
// Task<Parsed, FetchError | ParseError>

// Add resilience
const resilient = task.withRetry(fetchData, 3, 1000);
const bounded = task.withTimeout(fetchData, 5000, new Error("Timeout"));

// Parallel execution
const allData = task.allPar([task1, task2, task3]);

// Execute
const result = await task.runTask(resilient);
```

### 🧩 Context-Aware Tasks (Reader Pattern)

Tasks can declare **requirements** — services, signals, or configuration they
need to run. This is the [Reader monad](https://wiki.haskell.org/Reader_monad)
pattern, also used by [Effect.ts](https://effect.website/) as `Effect<A, E, R>`.

#### Why Context?

Instead of passing dependencies through every function call:

```typescript
// ❌ Manual threading — verbose, error-prone
const getUser = (id: string, db: Database, logger: Logger) => ...
const getOrder = (userId: string, db: Database, logger: Logger) => ...
```

Declare requirements in the type and provide them once:

```typescript
// ✅ Context threading — clean, composable
import * as functions from "@eserstack/functions";
import * as results from "@eserstack/primitives/results";

const { task } = functions;

type AppCtx = { readonly db: Database; readonly logger: Logger };

const getUser = (id: string): task.Task<User, AppError, AppCtx> =>
  task.task((ctx) => {
    ctx.logger.info("Fetching user", { id });
    const user = ctx.db.users.find(id);
    return Promise.resolve(results.ok(user));
  });

// Provide context once at the edge
const result = await task.runTask(getUser("123"), {
  db: postgres,
  logger: console,
});
```

#### Cancellation

```typescript
import * as functions from "@eserstack/functions";
import * as results from "@eserstack/primitives/results";

const { task } = functions;

const fetchData = task.task<Data, FetchError, task.Cancellable>(
  async (ctx) => {
    const resp = await fetch("/api/data", { signal: ctx.signal });
    return results.ok(await resp.json());
  },
);

const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);
const result = await task.runTask(fetchData, { signal: controller.signal });
```

#### Observability

```typescript
const traced = task.withLogging(fetchData, "fetch-data");
// Automatically logs: "[fetch-data] started" and "[fetch-data] completed/failed"
```

#### Providing Context (Dependency Injection)

```typescript
// Satisfy requirements upfront → returns a context-free Task
const ready = task.provideContext(getUser("123"), {
  db: postgres,
  logger: console,
});

// Now runs without context
const result = await task.runTask(ready);
```

> **FP note:** `provideContext` is analogous to Haskell's `runReaderT` or
> Effect.ts's `Effect.provideService()`. It "eliminates" the R parameter by
> closing over the environment.

### 🔌 Trigger Adapters (Ports & Adapters)

Define business logic once, invoke it from any source — HTTP, queue, CLI, cron,
or **AI tool calls**. This implements the
[Ports & Adapters](https://alistair.cockburn.us/hexagonal-architecture/)
(hexagonal architecture) pattern for function invocation. See also:
[Context-Aware Tasks](#-context-aware-tasks-reader-pattern) for the underlying
context system.

#### Define a Handler

A `Handler<I, O, E, R>` is a function from typed input to a context-aware Task:

```typescript
import * as functions from "@eserstack/functions";
import * as results from "@eserstack/primitives/results";

const { handler, task } = functions;

type OrderInput = { readonly customerId: string };

const createOrder: handler.Handler<OrderInput, Order, OrderError, AppCtx> = (
  input,
) =>
  task.task(async (ctx) => {
    const order = await ctx.db.orders.insert(input);
    return results.ok(order);
  });
```

#### Write Adapters for Each Trigger

```typescript
const { triggers } = functions;

// HTTP adapter
const fromHttp: handler.Adapter<triggers.HttpEvent, OrderInput> = (event) => {
  if (event.method !== "POST") {
    return results.fail(handler.adaptError("Method not allowed"));
  }
  return results.ok(event.body as OrderInput);
};

// Queue adapter
const fromQueue: handler.Adapter<triggers.QueueEvent, OrderInput> = (event) =>
  results.ok(JSON.parse(event.body as string) as OrderInput);

// CLI adapter
const fromCli: handler.Adapter<triggers.CliEvent, OrderInput> = (event) =>
  results.ok({ customerId: event.flags["customer"] as string });
```

#### Bind and Run

```typescript
const httpHandler = handler.bind(createOrder, fromHttp);
const queueHandler = handler.bind(createOrder, fromQueue);
const cliHandler = handler.bind(createOrder, fromCli);

// All share the same context requirements
const ctx = { db: postgres, logger: console };
await task.runTask(httpHandler(httpEvent), ctx);
await task.runTask(queueHandler(queueEvent), ctx);
```

> **FP note:** `bind()` is a contravariant map on the input side — it maps over
> the Handler's input type in reverse. The adapter can fail, so the error type
> naturally widens: `E | AdaptError`.
>
> **AWS Lambda comparison:** Lambda uses untyped `event: any`. Our adapters
> provide full type safety: `Adapter<HttpEvent, OrderInput>` ensures the
> transformation is checked at compile time.

#### AI Tool Calls

In the age of AI agents, functions aren't just triggered by HTTP or CLI —
they're invoked by LLMs as **tool calls**. The same Handler pattern works
seamlessly:

```typescript
const { triggers } = functions;

// AI tool call adapter — validates arguments from the model
const fromToolCall: handler.Adapter<triggers.ToolCallEvent, OrderInput> = (
  event,
) => {
  const args = event.arguments as { customerId?: string } | null;
  if (args?.customerId === undefined) {
    return results.fail(handler.adaptError("Missing customerId"));
  }
  return results.ok({ customerId: args.customerId });
};

// Response mapper — formats result for the model
const toToolResponse: handler.ResponseMapper<
  Order,
  OrderError | handler.AdaptError,
  triggers.ToolCallResponse
> = (result) => {
  if (results.isOk(result)) {
    return { content: result.value };
  }
  return { content: { error: result.error }, isError: true };
};

// Wire the trigger
const handleToolCall = handler.createTrigger({
  handler: createOrder,
  adaptInput: fromToolCall,
  adaptOutput: toToolResponse,
});

// Called when an LLM invokes this as a tool
const response = await handleToolCall(
  {
    name: "create-order",
    arguments: { customerId: "cust-1" },
    callId: "call_abc",
  },
  ctx,
);
// → { content: { id: "order-1", customerId: "cust-1" }, isError: false }
```

This works with any AI framework — Claude tool use, OpenAI function calling, MCP
tools, LangChain/LangGraph, Pydantic AI. The `ToolCallEvent` and
`ToolCallResponse` types align with the Go
[aifx](../../apps/services/pkg/eser-go/aifx/) package (`ToolCall` / `ToolResult`
structs) for cross-language consistency.

> **Why it matters:** LLM arguments are loosely typed JSON. The `Adapter`
> validates them with full type safety — if the model sends malformed arguments,
> you get `AdaptError`, not a runtime crash. The same handler serves CLI users,
> HTTP clients, and AI agents without any business logic duplication.

## functions.resources.* — Resource Management

Safe acquire-use-release patterns with guaranteed cleanup:

```typescript
import * as functions from "@eserstack/functions";
import * as results from "@eserstack/primitives/results";

const { resources } = functions;

// Bracket pattern
const result = await resources.bracket(
  () => results.ok(openFile("data.txt")), // acquire
  (file) => results.ok(file.read()), // use
  (file) => file.close(), // release (always runs)
);

// Scope for multiple resources (LIFO cleanup)
const processed = await resources.scoped(async (scope) => {
  const file = await resources.acquireRelease(
    scope,
    () => results.ok(openFile("data.txt")),
    (f) => f.close(),
  );

  const conn = await resources.acquireRelease(
    scope,
    () => results.ok(openConnection()),
    (c) => c.close(),
  );

  return results.ok(process(file, conn));
}); // All resources automatically released in reverse order

// Retry with backoff
const fetched = await resources.retryWithBackoff(
  () => fetchData(),
  {
    maxAttempts: 3,
    initialDelay: 100,
    maxDelay: 1000,
    factor: 2,
  },
);

// Timeout
const slow = await resources.withTimeout(
  () => slowOperation(),
  5000,
  "Operation timed out",
);
```

### When to Use Which?

| Use Case                 | Pattern                 | Why                                                               |
| ------------------------ | ----------------------- | ----------------------------------------------------------------- |
| Sequential async ops     | `functions.run()`       | Access intermediate values, short-circuit on failure              |
| Config parsing           | `functions.runSync()`   | Chain validations synchronously                                   |
| HTTP middleware          | `functions.collect()`   | Before/after hooks, delegation                                    |
| Streaming results        | `functions.collect()`   | Emit multiple values                                              |
| Deferred computation     | `functions.task.*`      | Lazy evaluation, composable retry/timeout                         |
| Dependency injection     | `functions.task.*`      | Context threading via Reader pattern                              |
| Multi-source invocation  | `functions.handler.*`   | Same logic, different triggers (HTTP/queue/CLI/cron/AI tool call) |
| File/connection handling | `functions.resources.*` | Guaranteed cleanup                                                |

## API Reference

### functions.*

| Function             | Description                             |
| -------------------- | --------------------------------------- |
| `run(generator)`     | Async monadic composition (do-notation) |
| `runSync(generator)` | Sync monadic composition                |
| `collect(...fns)`    | Create middleware pipeline              |

### functions.collect() Pipeline Methods

| Method              | Description                 |
| ------------------- | --------------------------- |
| `use(...fns)`       | Add middleware functions    |
| `mapError(fn)`      | Transform pipeline errors   |
| `recover(fn)`       | Recover from errors         |
| `iterate(...args)`  | Execute as async generator  |
| `run(...args)`      | Execute and collect results |
| `runFirst(...args)` | Get first result            |
| `runLast(...args)`  | Get last result             |

### functions.task.*

| Function                       | Description                                      |
| ------------------------------ | ------------------------------------------------ |
| `task(execute)`                | Create from `(ctx: R) => Promise<Result<T,E>>`   |
| `succeed(value)`               | Task that always succeeds                        |
| `failTask(error)`              | Task that always fails                           |
| `fromPromise(fn)`              | Wrap a Promise-returning function                |
| `map(task, fn)`                | Transform success value (propagates R)           |
| `flatMap(task, fn)`            | Chain tasks (widens R via MergeContext)          |
| `flatMapW(task, fn)`           | Chain with error + context widening              |
| `runTask(task)` / `(task,ctx)` | Execute with optional context                    |
| `provideContext(task, ctx)`    | Satisfy requirements → context-free Task         |
| `withAbort(task, timeoutMs)`   | Add cancellation (requires Cancellable context)  |
| `withLogging(task, label)`     | Add structured logging (requires Observable ctx) |
| `validate(predicate, message)` | Create validation step returning Task            |
| `all(tasks)`                   | Sequential execution, fail-fast (propagates R)   |
| `allPar(tasks)`                | Parallel execution, fail-fast (propagates R)     |
| `withRetry(task, n, delay)`    | Retry on failure (propagates R)                  |
| `withTimeout(task, ms, err)`   | Add timeout (propagates R)                       |

### functions.handler.*

| Function                 | Description                                     |
| ------------------------ | ----------------------------------------------- |
| `bind(handler, adapter)` | Bind adapter to handler (contravariant map)     |
| `createTrigger(binding)` | Create full round-trip trigger (input + output) |
| `adaptError(message)`    | Create an AdaptError                            |

### functions.triggers.*

| Type               | Description                               |
| ------------------ | ----------------------------------------- |
| `HttpEvent`        | HTTP request (method, path, headers, etc) |
| `QueueEvent`       | Queue message (messageId, body, etc)      |
| `CliEvent`         | CLI invocation (command, args, flags)     |
| `CronEvent`        | Scheduled trigger (scheduledTime, name)   |
| `ToolCallEvent`    | AI tool call (name, arguments, callId)    |
| `HttpResponse`     | HTTP response (status, headers, body)     |
| `QueueAction`      | Queue result (ack / nack)                 |
| `ToolCallResponse` | Tool call result (content, isError)       |

### functions.resources.*

| Function                                  | Description                    |
| ----------------------------------------- | ------------------------------ |
| `bracket(acquire, use, release)`          | Safe resource handling         |
| `createScope()`                           | Create finalizer scope         |
| `scoped(fn)`                              | Run with auto-closing scope    |
| `acquireRelease(scope, acquire, release)` | Register resource with scope   |
| `retry(fn, attempts, delay)`              | Simple retry                   |
| `retryWithBackoff(fn, options)`           | Retry with exponential backoff |
| `withTimeout(fn, ms, error)`              | Add timeout to operation       |
| `ensure(fn, finalizer)`                   | Guaranteed finalizer execution |

## 📚 Further Reading

### Context & Dependencies

- [Reader Monad](https://wiki.haskell.org/Reader_monad) — Haskell wiki on the
  Reader pattern
- [Wadler (1992)](https://homepages.inf.ed.ac.uk/wadler/papers/marktoberdorf/baastad.pdf)
  — "Monads for functional programming"
- [Effect.ts](https://effect.website/) — TypeScript library using
  `Effect<A, E, R>` with the same three-parameter design
- [fp-ts ReaderTaskEither](https://gcanti.github.io/fp-ts/modules/ReaderTaskEither.ts.html)
  — fp-ts equivalent combining Reader + Task + Either

### Adapters & Architecture

- [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)
  — Alistair Cockburn's original Ports & Adapters pattern
- [AWS Lambda Event Sources](https://docs.aws.amazon.com/lambda/latest/dg/invocation-eventsourcemapping.html)
  — Lambda's trigger adapter model
- [Contravariant Functor](https://hackage.haskell.org/package/contravariant) —
  The FP pattern behind input adaptation

### AI Tool Calling

- [Claude Tool Use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
  — Anthropic's tool use protocol (`name` + `input` → `content`)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) — Open
  standard for AI tool integration
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
  — OpenAI's function calling API
- [eser-go aifx](../../apps/services/pkg/eser-go/aifx/) — Go-side AI provider
  abstraction with matching `ToolCall`/`ToolResult` types

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
