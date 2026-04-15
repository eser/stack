# 🧱 [@eserstack/fp](./)

> **eserstack Foundation** —
> [eser/stack on GitHub](https://github.com/eser/stack) **Install:**
> `pnpm add jsr:@eserstack/fp`

Pure functional combinators for the eserstack ecosystem.

## Vision

`@eserstack/fp` is the **transformation layer** — every function is pure, takes
data in, returns new data out. Like Lodash/Ramda for the `@eser` type system.
All functions are deterministic, side-effect-free, and independently importable.

## Design Philosophy

- **Pure functions only.** Same input always produces the same output, no side
  effects, no mutation.
- **Operates on primitives.** Types come from `@eserstack/primitives` — this
  package provides the operations to work with them.
- **Single-step transformations.** Each function does one thing:
  `map(result, fn)` transforms a value, `match(result, handlers)` pattern
  matches. For multi-step workflows, see `@eserstack/functions`.
- **Independently importable.** Every function lives in its own subpath — import
  only what you use.

## How It Fits

```
@eserstack/primitives  →  @eserstack/fp  →  @eserstack/functions
   (types +          (this package)  (higher-level
    constructors)     pure FP         compositions)
                      combinators)
```

- **vs `@eserstack/primitives`**: Primitives defines `Result<T, E>` — fp gives
  you `map`, `flatMap`, `match` to work with it.
- **vs `@eserstack/functions`**: fp is `map(result, fn)` — one step. Functions
  is `run(function*() { ... })` — many steps composed into workflows.

## Result Combinators

```typescript
import * as results from "@eserstack/primitives/results";

// Transform values
const doubled = results.map(results.ok(21), (x) => x * 2); // ok(42)

// Chain operations
const chained = results.flatMap(results.ok(5), (x) => results.ok(x + 1)); // ok(6)

// Error type widening — E1 | E2 union automatically
const widened = results.flatMapW(
  results.ok<number, "NotFound">(5),
  (x) => x > 0 ? results.ok(x) : results.fail("Negative" as const),
); // Result<number, "NotFound" | "Negative">

// Pattern matching
const message = results.match(results.ok(42), {
  ok: (v) => `Value: ${v}`,
  fail: (e) => `Error: ${e}`,
});

// Safe wrappers
const parsed = results.tryCatch(() => JSON.parse(data));
const fetched = await results.tryCatchAsync(() => fetch(url));

// Collect results
const combined = results.all([results.ok(1), results.ok(2), results.ok(3)]); // ok([1, 2, 3])
const first = results.any([results.fail("a"), results.ok(1)]); // ok(1)
```

## Option Combinators

```typescript
import * as options from "@eserstack/primitives/options";

// Convert nullable values
const opt = options.fromNullable(maybeValue); // Some or None

// Transform
const doubled = options.map(options.some(21), (x) => x * 2); // some(42)

// Filter
const positive = options.filter(options.some(5), (x) => x > 0); // some(5)

// Pattern matching
const label = options.match(options.some(42), {
  some: (v) => `Found: ${v}`,
  none: () => "Not found",
});

// Convert to Result
const result = options.toResult(options.none, new Error("Missing"));

// Combine options
const pair = options.zip(options.some(1), options.some("a")); // some([1, "a"])
```

## Value-Threading Pipe

Thread a value through a sequence of transformations, left to right:

```typescript
import { pipe } from "@eserstack/fp/pipe";
import * as results from "@eserstack/primitives/results";

// pipe(value, f1, f2, ...) → result
const result = pipe(
  results.ok(10),
  (r) => results.map(r, (x) => x * 2),
  (r) => results.flatMap(r, (x) => results.ok(String(x))),
  (r) => results.getOrElse(r, "fallback"),
);
// result: "20"
```

Full type inference with overloads for 1–9 steps.

## Function Composition (flow)

Compose functions left to right (previously named `pipe`):

```typescript
import { flow } from "@eserstack/fp/flow";

const slugify = flow(
  (x: string) => x.toLowerCase(),
  (x: string) => x.replace(/[^\w -]+/g, ""),
  (x: string) => x.split(" "),
  (x: string[]) => x.join("-"),
);

slugify("Hello World!"); // "hello-world"
```

## Data Utilities

All immutable, all pure — arrays, objects, and more:

| Category         | Functions                                                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Array ops**    | `appendToArray`, `prependToArray`, `filterArray`, `mapArray`, `mergeArrays`, `reverseArray`, `splitArray`, `takeFromArray`, `dropFromArray`, `distinctArray`, `chunk`  |
| **Object ops**   | `appendToObject`, `prependToObject`, `filterObject`, `mapObject`, `mergeObjects`, `reverseObject`, `splitObject`, `takeFromObject`, `dropFromObject`, `distinctObject` |
| **Remove**       | `removeValueFromArray`, `removeIndexFromArray`, `removeFirstMatchFromArray`, `removeKeyFromObject`, `removeValueFromObject`, `removeFirstMatchFromObject`              |
| **Lookup**       | `pickFromArray`, `pickFromObject`, `associateArray`, `associateObject`, `groupBy`, `keyBy`, `get`                                                                      |
| **Composition**  | `flow` (left-to-right), `compose` (right-to-left), `pipe` (value-threading)                                                                                            |
| **Higher-order** | `curry`, `curryRight`, `decorate`, `memoize`, `mutate`                                                                                                                 |
| **Patterns**     | `match` (discriminated union matching), `wth`/`wthout`                                                                                                                 |
| **State**        | `dispatcher` (controlled state mutations)                                                                                                                              |
| **Events**       | `emitter` (pub/sub event emission)                                                                                                                                     |
| **Iteration**    | `iterate` (apply function over iterables)                                                                                                                              |
| **Deep ops**     | `deepCopy`, `deepMerge`                                                                                                                                                |
| **Results**      | `map`, `flatMap`, `flatMapW`, `mapError`, `match`, `getOrElse`, `tryCatch`, `all`, `any`, ...                                                                          |
| **Options**      | `map`, `flatMap`, `filter`, `fromNullable`, `match`, `toResult`, `zip`, ...                                                                                            |

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
