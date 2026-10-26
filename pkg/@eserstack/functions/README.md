# ⚡ [@eserstack/functions](./)

> **Note:** JSR is frozen at 4.5.x. From 5.0.0, `@eserstack/functions` is
> published on npm under the same name (`pnpm add @eserstack/functions`); the
> JSR versions stay available but get no updates.

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
  threading, and a task is a plain object that holds one
  `(ctx: R) => Promise<Result<T, E>>` function.

## Quick Start

`fetchUser` and `fetchPosts` stand in for your own data access; each returns a
`Result`, which `yield*` unwraps inside `functions.run()`:

```typescript
import * as functions from "@eserstack/functions";
import * as primitives from "@eserstack/primitives";

type User = { readonly id: number; readonly name: string };
type Post = { readonly userId: number; readonly title: string };

const fetchUser = (id: number): primitives.results.Result<User, Error> =>
  primitives.results.ok({ id, name: "Ada" });
const fetchPosts = (userId: number): primitives.results.Result<Post[], Error> =>
  primitives.results.ok([{ userId, title: "Hello" }]);

// Monadic do-notation
const result = await functions.run(async function* () {
  const user = yield* fetchUser(1);
  const posts = yield* fetchPosts(user.id);
  return { user, posts };
});

// Pattern matching
primitives.results.match(result, {
  ok: (value) => console.log(`Got ${value.posts.length} posts`),
  fail: (error) => console.error(`Error: ${error}`),
});
```

## functions.run() / functions.runSync() — Monadic Composition

Use when you need **sequential operations with access to intermediate values**.
When a step is async, `yield* await` unwraps the `Promise` of a `Result`:

```typescript
import * as functions from "@eserstack/functions";
import * as primitives from "@eserstack/primitives";

type User = { readonly id: number; readonly name: string };
type Post = { readonly userId: number; readonly title: string };
type Fetched<T> = Promise<primitives.results.Result<T, Error>>;

const fetchUser = (id: number): Fetched<User> =>
  Promise.resolve(primitives.results.ok({ id, name: "Ada" }));
const fetchPosts = (userId: number): Fetched<Post[]> =>
  Promise.resolve(primitives.results.ok([{ userId, title: "Hello" }]));

// Async monadic composition (do-notation)
const fetchUserWithPosts = (userId: number) =>
  functions.run(async function* () {
    const user = yield* await fetchUser(userId); // Unwrap Result, get value
    const posts = yield* await fetchPosts(user.id); // Use user.id!
    return { user, posts }; // Compute final result
  });

const result = await fetchUserWithPosts(1);
// result: Result<{ user: User, posts: Post[] }, Error>
```

`functions.runSync()` is the sync version. It stops at the first failure and
returns it:

```typescript
import * as functions from "@eserstack/functions";
import * as primitives from "@eserstack/primitives";

type Json = { readonly port?: unknown; readonly host?: string };
type Checked<T> = primitives.results.Result<T, string>;

const parseJson = (input: string): Checked<Json> =>
  primitives.results.tryCatch(
    () => JSON.parse(input),
    () => "invalid JSON",
  );
const validatePort = (port: unknown): Checked<number> =>
  typeof port === "number" && port > 0 && port < 65536
    ? primitives.results.ok(port)
    : primitives.results.fail(`invalid port: ${port}`);

// Sync version
const parseConfig = (input: string) =>
  functions.runSync(function* () {
    const json = yield* parseJson(input); // Unwrap Result
    const port = yield* validatePort(json.port); // Use json!
    return { port, host: json.host };
  });

// Short-circuits on first failure
const computed = functions.runSync(function* () {
  const a = yield* primitives.results.ok(5);
  const b = yield* primitives.results.fail("error"); // Stops here
  return a + b; // Never reached
});
// computed: primitives.results.fail("error")
```

## functions.collect() — Middleware/Streaming Pattern

Koa-style middleware chains for streaming results with before/after hooks. Each
middleware receives a context and the arguments the pipeline runs with;
`yield* ctx.next()` runs the rest of the chain and passes its results on.
`ctx.state` is shared by the middleware of one run:

```typescript
import * as functions from "@eserstack/functions";
import * as primitives from "@eserstack/primitives";

const pipeline = functions
  .collect<string, Error>()
  .use(async function* (ctx, name) {
    // Logging middleware
    console.log("Before:", name);
    yield* ctx.next(); // Delegate to next
    console.log("After");
  })
  .use(async function* (_ctx, name) {
    // Handler - emit results
    yield primitives.results.ok(`Hello, ${name}!`);
  });

// Run and collect all results
const result = await pipeline.run("World");
// result: ok(["Hello, World!"])

// Or iterate one by one
for await (const item of pipeline.iterate("World")) {
  console.log(item);
}
```

`mapError()` and `recover()` apply once to every failure the chain emits,
including failures that pass up through `ctx.next()`:

```typescript
import * as functions from "@eserstack/functions";
import * as primitives from "@eserstack/primitives";

// Error handling in pipelines
const withRecovery = functions
  .collect<number, string>()
  .use(() => primitives.results.fail("error"))
  .recover((_error) => primitives.results.ok(0)); // Recover from errors

const recovered = await withRecovery.run();
// recovered: ok([0])
```

## functions.task.* — Lazy Computation

`Task<T, E, R>` wraps a `(ctx: R) => Promise<Result<T, E>>` — the computation
doesn't execute until you call `runTask()`. Composable with retry, timeout,
cancellation, and observability. See also:
[Context-Aware Tasks](#-context-aware-tasks-reader-pattern) for dependency
injection and cancellation.

`fetchItem` builds a task that fetches one item; nothing is fetched until a task
runs:

```typescript
import * as functions from "@eserstack/functions";

type Item = { readonly id: number; readonly tags: readonly string[] };
type ParseError = { readonly _tag: "ParseError"; readonly id: number };

// Create tasks
const fetchItem = (id: number) =>
  functions.task.fromPromise(() =>
    fetch(`/api/items/${id}`).then((r) => r.json() as Promise<Item>),
  );
const fetchData = fetchItem(1);
const constant = functions.task.succeed(42);

// Compose
const transformed = functions.task.map(fetchData, (data) => data.tags);
const chained = functions.task.flatMap(fetchData, (data) => fetchItem(data.id));

// Error type widening
const parseTags = (
  data: Item,
): functions.task.Task<readonly string[], ParseError> =>
  data.tags.length > 0
    ? functions.task.succeed(data.tags)
    : functions.task.failTask<ParseError>({ _tag: "ParseError", id: data.id });
const widened = functions.task.flatMapW(fetchData, parseTags);
// Task<readonly string[], Error | ParseError>
```

Retry, timeout and parallel execution wrap a task without running it;
`runTask()` runs it:

```typescript
import * as functions from "@eserstack/functions";

const fetchItem = (id: number) =>
  functions.task.fromPromise(() => fetch(`/api/items/${id}`));
const fetchData = fetchItem(1);

// Add resilience
const resilient = functions.task.withRetry(fetchData, 3, 1000);
const bounded = functions.task.withTimeout(
  fetchData,
  5000,
  new Error("Timeout"),
);

// Parallel execution
const allData = functions.task.allPar([fetchItem(1), fetchItem(2)]);

// Execute
const result = await functions.task.runTask(resilient);
```

### 🧩 Context-Aware Tasks (Reader Pattern)

Tasks can declare **requirements** — services, signals, or configuration they
need to run. This is the [Reader monad](https://wiki.haskell.org/Reader_monad)
pattern, also used by [Effect.ts](https://effect.website/) as `Effect<A, E, R>`.

#### Why Context?

Instead of passing dependencies through every function call:

```typescript
type Database = { readonly find: (table: string, id: string) => unknown };
type Logger = { readonly info: (message: string) => void };

// ❌ Manual threading — verbose, error-prone
const getUser = (id: string, db: Database, logger: Logger) => {
  logger.info(`Fetching user ${id}`);
  return db.find("users", id);
};
const getOrder = (userId: string, db: Database, logger: Logger) => {
  logger.info(`Fetching orders of ${userId}`);
  return db.find("orders", userId);
};
```

Declare requirements in the type and provide them once. Here `AppCtx` holds an
in-memory user table and a logger; `console` fits `functions.task.Logger`:

```typescript
// ✅ Context threading — clean, composable
import * as functions from "@eserstack/functions";
import * as primitives from "@eserstack/primitives";

type User = { readonly id: string; readonly name: string };
type AppError = { readonly _tag: "NotFound"; readonly id: string };
type AppCtx = {
  readonly users: ReadonlyMap<string, User>;
  readonly logger: functions.task.Logger;
};

const getUser = (id: string): functions.task.Task<User, AppError, AppCtx> =>
  functions.task.task((ctx) => {
    ctx.logger.info("Fetching user", { id });
    const user = ctx.users.get(id);
    return Promise.resolve(
      user === undefined
        ? primitives.results.fail({ _tag: "NotFound", id })
        : primitives.results.ok(user),
    );
  });

// Provide context once at the edge
const users = new Map([["123", { id: "123", name: "Ada" }]]);
const result = await functions.task.runTask(getUser("123"), {
  users,
  logger: console,
});
```

#### Cancellation

A task that needs `functions.task.Cancellable` reads the abort signal from its
context:

```typescript
import * as functions from "@eserstack/functions";
import * as primitives from "@eserstack/primitives";

type Data = { readonly items: readonly string[] };
type FetchError = { readonly _tag: "FetchError"; readonly status: number };

const fetchData = functions.task.task<
  Data,
  FetchError,
  functions.task.Cancellable
>(async (ctx) => {
  const resp = await fetch("/api/data", { signal: ctx.signal });
  if (!resp.ok) {
    return primitives.results.fail({ _tag: "FetchError", status: resp.status });
  }
  return primitives.results.ok((await resp.json()) as Data);
});

const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);
const result = await functions.task.runTask(fetchData, {
  signal: controller.signal,
});
```

#### Observability

`withLogging()` adds `functions.task.Observable` to the task's requirements, so
the logger comes from the context:

```typescript
import * as functions from "@eserstack/functions";

const fetchData = functions.task.fromPromise(() => fetch("/api/data"));

const traced = functions.task.withLogging(fetchData, "fetch-data");
// Automatically logs: "[fetch-data] started" and "[fetch-data] completed/failed"

await functions.task.runTask(traced, { logger: console });
```

#### Providing Context (Dependency Injection)

`provideContext()` closes a task over its context. `greet` needs a greeting from
the context:

```typescript
import * as functions from "@eserstack/functions";
import * as primitives from "@eserstack/primitives";

type GreetCtx = { readonly greeting: string };

const greet = (name: string): functions.task.Task<string, never, GreetCtx> =>
  functions.task.task((ctx) =>
    Promise.resolve(primitives.results.ok(`${ctx.greeting}, ${name}!`)),
  );

// Satisfy requirements upfront → returns a context-free Task
const ready = functions.task.provideContext(greet("Ada"), {
  greeting: "Hello",
});

// Now runs without context
const result = await functions.task.runTask(ready);
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

A `Handler<I, O, E, R>` is a function from typed input to a context-aware Task.
`AppCtx` here holds an in-memory order list and a logger:

```typescript
import * as functions from "@eserstack/functions";
import * as primitives from "@eserstack/primitives";

type OrderInput = { readonly customerId: string };
type Order = { readonly id: string; readonly customerId: string };
type OrderError = { readonly _tag: "OrderError"; readonly message: string };
type AppCtx = {
  readonly orders: Order[];
  readonly logger: functions.task.Logger;
};

const createOrder: functions.handler.Handler<
  OrderInput,
  Order,
  OrderError,
  AppCtx
> = (input) =>
  functions.task.task((ctx) => {
    const order = { id: `order-${ctx.orders.length + 1}`, ...input };
    ctx.orders.push(order);
    ctx.logger.info("Order created", { id: order.id });
    return Promise.resolve(primitives.results.ok(order));
  });
```

#### Write Adapters for Each Trigger

Each adapter turns one trigger's event into `OrderInput`, or fails with an
`AdaptError`:

```typescript
import * as functions from "@eserstack/functions";
import * as primitives from "@eserstack/primitives";

type OrderInput = { readonly customerId: string };
type OrderAdapter<Event> = functions.handler.Adapter<Event, OrderInput>;

// HTTP adapter
const fromHttp: OrderAdapter<functions.triggers.HttpEvent> = (event) => {
  if (event.method !== "POST") {
    return primitives.results.fail(
      functions.handler.adaptError("Method not allowed"),
    );
  }
  return primitives.results.ok(event.body as OrderInput);
};

// Queue adapter
const fromQueue: OrderAdapter<functions.triggers.QueueEvent> = (event) =>
  primitives.results.ok(JSON.parse(event.body as string) as OrderInput);

// CLI adapter
const fromCli: OrderAdapter<functions.triggers.CliEvent> = (event) =>
  primitives.results.ok({ customerId: event.flags["customer"] as string });
```

#### Bind and Run

`bind()` joins a handler and an adapter into a handler that takes the trigger's
event. The handler and adapters here are short versions of the ones above:

```typescript
import * as functions from "@eserstack/functions";
import * as primitives from "@eserstack/primitives";

type OrderInput = { readonly customerId: string };
type AppCtx = { readonly logger: functions.task.Logger };

const createOrder = (input: OrderInput) =>
  functions.task.task<string, Error, AppCtx>((ctx) => {
    ctx.logger.info("Order created", { customerId: input.customerId });
    return Promise.resolve(primitives.results.ok(`order-${input.customerId}`));
  });
const fromQueue = (event: functions.triggers.QueueEvent) =>
  primitives.results.ok(JSON.parse(event.body as string) as OrderInput);
const fromCli = (event: functions.triggers.CliEvent) =>
  primitives.results.ok({ customerId: event.flags["customer"] as string });

const queueHandler = functions.handler.bind(createOrder, fromQueue);
const cliHandler = functions.handler.bind(createOrder, fromCli);

// All share the same context requirements
const ctx: AppCtx = { logger: console };
const queueEvent = {
  messageId: "msg-1",
  body: '{"customerId":"cust-1"}',
  attributes: {},
  receiveCount: 1,
};
await functions.task.runTask(queueHandler(queueEvent), ctx);
const cliEvent = { command: "order", args: [], flags: { customer: "cust-1" } };
await functions.task.runTask(cliHandler(cliEvent), ctx);
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
they're invoked by LLMs as **tool calls**. The same Handler pattern applies.
`createOrder` below is a context-free stand-in for the handler above; with a
context-aware handler, `handleToolCall` takes the context as its second
argument:

```typescript
import * as functions from "@eserstack/functions";
import * as primitives from "@eserstack/primitives";

type OrderInput = { readonly customerId: string };
type Order = { readonly id: string; readonly customerId: string };

const createOrder: functions.handler.Handler<OrderInput, Order> = (input) =>
  functions.task.succeed({ id: "order-1", ...input });

// AI tool call adapter — validates arguments from the model
const fromToolCall: functions.handler.Adapter<
  functions.triggers.ToolCallEvent,
  OrderInput
> = (event) => {
  const args = event.arguments as { customerId?: string } | null;
  if (args?.customerId === undefined) {
    return primitives.results.fail(
      functions.handler.adaptError("Missing customerId"),
    );
  }
  return primitives.results.ok({ customerId: args.customerId });
};

// Response mapper — formats result for the model
const toToolResponse: functions.handler.ResponseMapper<
  Order,
  Error | functions.handler.AdaptError,
  functions.triggers.ToolCallResponse
> = (result) => {
  if (primitives.results.isOk(result)) {
    return { content: result.value };
  }
  return { content: { error: result.error }, isError: true };
};

// Wire the trigger
const handleToolCall = functions.handler.createTrigger({
  handler: createOrder,
  adaptInput: fromToolCall,
  adaptOutput: toToolResponse,
});

// Called when an LLM invokes this as a tool
const response = await handleToolCall({
  name: "create-order",
  arguments: { customerId: "cust-1" },
  callId: "call_abc",
});
// → { content: { id: "order-1", customerId: "cust-1" } }
```

This works with any AI framework — Claude tool use, OpenAI function calling, MCP
tools, LangChain/LangGraph, Pydantic AI. The `ToolCallEvent` and
`ToolCallResponse` types align with the Go [aifx](../../ajan/aifx/) package
(`ToolCall` / `ToolResult` structs) for cross-language consistency.

> **Why it matters:** LLM arguments are loosely typed JSON. The `Adapter`
> validates them with full type safety — if the model sends malformed arguments,
> you get `AdaptError`, not a runtime crash. The same handler serves CLI users,
> HTTP clients, and AI agents without any business logic duplication.

## functions.resources.* — Resource Management

Safe acquire-use-release patterns with guaranteed cleanup. `openFile` and
`openConnection` stand in for resources that need closing:

```typescript
import * as functions from "@eserstack/functions";
import * as primitives from "@eserstack/primitives";

const openFile = (path: string) => ({ read: () => path, close: () => {} });
const openConnection = () => ({
  send: (s: string) => s.length,
  close: () => {},
});

// Bracket pattern
const result = await functions.resources.bracket(
  () => primitives.results.ok(openFile("data.txt")), // acquire
  (file) => primitives.results.ok(file.read()), // use
  (file) => file.close(), // release (always runs)
);

// Scope for multiple resources (LIFO cleanup)
const processed = await functions.resources.scoped(async (scope) => {
  const file = await functions.resources.acquireRelease(
    scope,
    () => primitives.results.ok(openFile("data.txt")),
    (f) => f.close(),
  );
  const conn = await functions.resources.acquireRelease(
    scope,
    () => primitives.results.ok(openConnection()),
    (c) => c.close(),
  );
  if (primitives.results.isFail(file) || primitives.results.isFail(conn)) {
    return primitives.results.fail("acquire failed");
  }

  return primitives.results.ok(conn.value.send(file.value.read()));
}); // All resources automatically released in reverse order
```

`retryWithBackoff()` and `withTimeout()` take a function that returns a
`Promise` of a `Result`. `fetchData` and `slowOperation` stand in for yours:

```typescript
import * as functions from "@eserstack/functions";
import * as primitives from "@eserstack/primitives";

const fetchData = () =>
  functions.task.runTask(functions.task.fromPromise(() => fetch("/api/data")));
const slowOperation = () =>
  new Promise<primitives.results.Result<string, string>>((resolve) =>
    setTimeout(() => resolve(primitives.results.ok("done")), 100),
  );

// Retry with backoff
const fetched = await functions.resources.retryWithBackoff(() => fetchData(), {
  maxAttempts: 3,
  initialDelay: 100,
  maxDelay: 1000,
  factor: 2,
});

// Timeout
const slow = await functions.resources.withTimeout(
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
- [ajan aifx](../../ajan/aifx/): Go-side AI provider abstraction with matching
  `ToolCall`/`ToolResult` types

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
