# ⚡ [@eser/functions](./)

Functional programming patterns for pipelines, middleware, and result handling.

## Features

- **results**: Type-safe error handling with discriminated unions
- **options**: Nullable value handling without null checks
- **collect()**: Middleware/streaming pattern for composable pipelines
- **run()/runSync()**: Monadic composition (do-notation) for sequential
  operations
- **resources**: Safe acquire-use-release patterns with finalizers

## Quick Start

```typescript
import * as functions from "@eser/functions";

// Result type for explicit error handling
const divide = (
  a: number,
  b: number,
): functions.results.Result<number, string> =>
  b === 0
    ? functions.results.fail("Division by zero")
    : functions.results.ok(a / b);

const result = divide(10, 2);
functions.results.match(result, {
  ok: (value) => console.log(`Result: ${value}`),
  fail: (error) => console.error(`Error: ${error}`),
});

// Option type for nullable values
const findUser = (id: string): functions.options.Option<string> =>
  id === "1" ? functions.options.some("Alice") : functions.options.none;

const user = findUser("1");
console.log(functions.options.getOrElse(user, "Unknown"));
```

## functions.results.*

Type-safe error handling using discriminated unions:

```typescript
import * as functions from "@eser/functions";

const { results } = functions;

// Create results
const success = results.ok(42);
const failure = results.fail(new Error("Something went wrong"));

// Type guards
if (results.isOk(success)) {
  console.log(success.value); // 42
}

// Combinators
const doubled = results.map(success, (x) => x * 2);
const chained = results.flatMap(success, (x) => results.ok(x + 1));

// Error transformation
const mapped = results.mapError(failure, (e) => e.message);

// Pattern matching
const message = results.match(success, {
  ok: (v) => `Success: ${v}`,
  fail: (e) => `Error: ${e}`,
});

// Collection utilities
const resultList = [results.ok(1), results.ok(2), results.ok(3)];
const combined = results.all(resultList); // results.ok([1, 2, 3])

// Async support
const fromAsync = await results.fromPromise(fetch("/api/data"));
const wrapped = results.tryCatch(() => JSON.parse(data));
```

## functions.options.*

Nullable value handling without null checks:

```typescript
import * as functions from "@eser/functions";

const { options } = functions;

// Create options
const some = options.some(42);
const none = options.none;
const fromNull = options.fromNullable(maybeValue);

// Type guards
if (options.isSome(some)) {
  console.log(some.value); // 42
}

// Combinators
const doubled = options.map(some, (x) => x * 2);
const chained = options.flatMap(some, (x) => options.some(x + 1));
const filtered = options.filter(some, (x) => x > 10);

// Value extraction
const value = options.getOrElse(some, 0);
const nullable = options.getOrNull(some);

// Pattern matching
const result = options.match(some, {
  some: (v) => `Value: ${v}`,
  none: () => "No value",
});

// Convert to Result
const asResult = options.toResult(none, new Error("No value"));
```

## functions.*

The main module provides two patterns for function composition:

### functions.run() / functions.runSync() - Monadic Composition

Use when you need **sequential operations with access to intermediate values**:

```typescript
import * as functions from "@eser/functions";

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
  const a = yield* functions.results.ok(5);
  const b = yield* functions.results.fail("error"); // Stops here

  return a + b; // Never reached
});
// computed: functions.results.fail("error")
```

### functions.collect() - Middleware/Streaming Pattern

Use when you need **middleware chains or multiple results**:

```typescript
import * as functions from "@eser/functions";

const pipeline = functions.collect<string, Error>()
  .use(async function* (ctx, name: string) {
    // Logging middleware
    console.log("Before:", name);
    yield* ctx.next(); // Delegate to next
    console.log("After");
  })
  .use(async function* (_ctx, name: string) {
    // Handler - emit results
    yield functions.results.ok(`Hello, ${name}!`);
  });

// Run and collect all results
const result = await pipeline.run("World");
// result: functions.results.ok(["Hello, World!"])

// Or iterate one by one
for await (const item of pipeline.iterate("World")) {
  console.log(item);
}

// Error handling in pipelines
const withRecovery = functions.collect<number, string>()
  .use(() => functions.results.fail("error"))
  .recover((_error) => functions.results.ok(0)); // Recover from errors
```

### When to Use Which?

| Use Case             | Pattern     | Why                        |
| -------------------- | ----------- | -------------------------- |
| Sequential async ops | `run()`     | Access intermediate values |
| Config parsing       | `runSync()` | Chain validations          |
| HTTP middleware      | `collect()` | Before/after hooks         |
| Streaming results    | `collect()` | Emit multiple values       |
| Request pipelines    | `collect()` | Express-like composition   |

## functions.resources.*

Safe acquire-use-release patterns:

```typescript
import * as functions from "@eser/functions";

// Bracket pattern
const result = await functions.resources.bracket(
  () => functions.results.ok(openFile("data.txt")), // acquire
  (file) => functions.results.ok(file.read()), // use
  (file) => file.close(), // release (always runs)
);

// Scope for multiple resources
const processed = await functions.resources.scoped(async (scope) => {
  const file = await functions.resources.acquireRelease(
    scope,
    () => functions.results.ok(openFile("data.txt")),
    (f) => f.close(),
  );

  const conn = await functions.resources.acquireRelease(
    scope,
    () => functions.results.ok(openConnection()),
    (c) => c.close(),
  );

  return functions.results.ok(process(file, conn));
}); // All resources automatically released

// Retry with backoff
const fetched = await functions.resources.retryWithBackoff(
  () => fetchData(),
  {
    maxAttempts: 3,
    initialDelay: 100,
    maxDelay: 1000,
    factor: 2,
  },
);

// Timeout
const slow = await functions.resources.withTimeout(
  () => slowOperation(),
  5000,
  "Operation timed out",
);
```

## API Reference

### functions.*

| Function             | Description                |
| -------------------- | -------------------------- |
| `run(generator)`     | Async monadic composition  |
| `runSync(generator)` | Sync monadic composition   |
| `collect(...fns)`    | Create middleware pipeline |

### functions.results.*

| Function                      | Description               |
| ----------------------------- | ------------------------- |
| `ok(value)`                   | Create a success result   |
| `fail(error)`                 | Create an error result    |
| `isOk(result)`                | Type guard for Ok         |
| `isFail(result)`              | Type guard for Fail       |
| `map(result, fn)`             | Transform success value   |
| `flatMap(result, fn)`         | Chain results             |
| `mapError(result, fn)`        | Transform error           |
| `match(result, handlers)`     | Pattern match             |
| `getOrElse(result, fallback)` | Extract with fallback     |
| `all(results)`                | Combine array of results  |
| `fromPromise(promise)`        | Convert Promise to Result |
| `tryCatch(fn)`                | Wrap throwing function    |

### functions.options.*

| Function                    | Description                |
| --------------------------- | -------------------------- |
| `some(value)`               | Create Some with value     |
| `none`                      | The None singleton         |
| `fromNullable(value)`       | Convert nullable to Option |
| `isSome(option)`            | Type guard for Some        |
| `isNone(option)`            | Type guard for None        |
| `map(option, fn)`           | Transform value            |
| `flatMap(option, fn)`       | Chain options              |
| `filter(option, predicate)` | Filter by predicate        |
| `match(option, handlers)`   | Pattern match              |
| `toResult(option, error)`   | Convert to Result          |

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

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
