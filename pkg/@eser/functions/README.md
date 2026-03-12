# ⚡ [@eser/functions](./)

Higher-level workflow compositions for the eserstack ecosystem.

## Vision

`@eser/functions` provides the **orchestration patterns** that compose primitive
operations into real-world workflows. Where `@eser/fp` gives you individual
steps, `@eser/functions` gives you the choreography — multi-step operations,
middleware pipelines, lazy computation, and resource lifecycle management.

## Design Philosophy

- **Workflows, not primitives.** Types and combinators live in
  `@eser/primitives`. This package provides the patterns that tie them together.
- **Generator-based composition.** `run()` uses generators for monadic
  do-notation — `yield*` unwraps Results, short-circuiting on failure.
- **Middleware pipelines.** `collect()` provides Koa-style middleware chains
  with `ctx.next()` delegation.
- **Lazy computation.** `Task<T, E>` wraps `() => Promise<Result<T, E>>` —
  nothing executes until you call `runTask()`.
- **Safe resource management.** `bracket`, `scoped`, and `acquireRelease`
  guarantee cleanup with LIFO finalizer ordering.

## How It Fits

```
@eser/primitives  →  @eser/fp  →  @eser/functions
   (types +           (pure FP      (this package)
    constructors)      combinators)   higher-level
                                      compositions)
```

- **vs `@eser/fp`**: fp is `map(result, fn)` — one step. Functions is
  `run(function*() { ... })` — many steps composed into workflows.
- **vs Effect.ts**: Lightweight, no runtime, no DI, no fibers. 80% of the value
  at 5% of the complexity.

## Quick Start

```typescript
import * as functions from "@eser/functions";
import * as results from "@eser/primitives/results";

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
import * as functions from "@eser/functions";
import * as results from "@eser/primitives/results";

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
import * as functions from "@eser/functions";
import * as results from "@eser/primitives/results";

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

`Task<T, E>` wraps a `() => Promise<Result<T, E>>` — the computation doesn't
execute until you call `runTask()`. Composable with retry and timeout bridges.

```typescript
import * as functions from "@eser/functions";

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

## functions.resources.* — Resource Management

Safe acquire-use-release patterns with guaranteed cleanup:

```typescript
import * as functions from "@eser/functions";
import * as results from "@eser/primitives/results";

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

| Use Case                 | Pattern                 | Why                                                  |
| ------------------------ | ----------------------- | ---------------------------------------------------- |
| Sequential async ops     | `functions.run()`       | Access intermediate values, short-circuit on failure |
| Config parsing           | `functions.runSync()`   | Chain validations synchronously                      |
| HTTP middleware          | `functions.collect()`   | Before/after hooks, delegation                       |
| Streaming results        | `functions.collect()`   | Emit multiple values                                 |
| Deferred computation     | `functions.task.*`      | Lazy evaluation, composable retry/timeout            |
| File/connection handling | `functions.resources.*` | Guaranteed cleanup                                   |

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

| Function                     | Description                              |
| ---------------------------- | ---------------------------------------- |
| `task(execute)`              | Create from `() => Promise<Result<T,E>>` |
| `succeed(value)`             | Task that always succeeds                |
| `failTask(error)`            | Task that always fails                   |
| `fromPromise(fn)`            | Wrap a Promise-returning function        |
| `map(task, fn)`              | Transform success value                  |
| `flatMap(task, fn)`          | Chain tasks                              |
| `flatMapW(task, fn)`         | Chain with error type widening           |
| `runTask(task)`              | Execute and get `Promise<Result<T,E>>`   |
| `all(tasks)`                 | Sequential execution, fail-fast          |
| `allPar(tasks)`              | Parallel execution, fail-fast            |
| `withRetry(task, n, delay)`  | Retry on failure                         |
| `withTimeout(task, ms, err)` | Add timeout                              |

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

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
