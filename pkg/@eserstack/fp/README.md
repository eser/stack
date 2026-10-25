# 🧱 [@eserstack/fp](./)

> **Note:** JSR is frozen at 4.5.x. From 5.0.0, `@eserstack/fp` is published on
> npm under the same name (`pnpm add @eserstack/fp`); the JSR versions stay
> available but get no updates.

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
import * as primitives from "@eserstack/primitives";

const data = '{"name":"eser"}';
const url = "https://jsr.io/@eserstack/fp";

// Transform values
const doubled = primitives.results.map(primitives.results.ok(21), (x) => x * 2); // ok(42)

// Chain operations
const chained = primitives.results.flatMap(
  primitives.results.ok(5),
  (x) => primitives.results.ok(x + 1),
); // ok(6)

// Error type widening — E1 | E2 union automatically
type Lookup = primitives.results.Result<number, "NotFound">;
const found: Lookup = primitives.results.ok(5);
const widened = primitives.results.flatMapW(
  found,
  (x) =>
    x > 0
      ? primitives.results.ok(x)
      : primitives.results.fail("Negative" as const),
); // Result<number, "NotFound" | "Negative">

// Pattern matching
const message = primitives.results.match(primitives.results.ok(42), {
  ok: (v) => `Value: ${v}`,
  fail: (e) => `Error: ${e}`,
});

// Safe wrappers
const parsed = primitives.results.tryCatch(() => JSON.parse(data));
const fetched = await primitives.results.tryCatchAsync(() => fetch(url));

// Collect results
const combined = primitives.results.all([
  primitives.results.ok(1),
  primitives.results.ok(2),
  primitives.results.ok(3),
]); // ok([1, 2, 3])
const first = primitives.results.any([
  primitives.results.fail("a"),
  primitives.results.ok(1),
]); // ok(1)
```

## Option Combinators

```typescript
import * as primitives from "@eserstack/primitives";

const maybeValue: number | null = 21;

// Convert nullable values
const opt = primitives.options.fromNullable(maybeValue); // Some or None

// Transform
const doubled = primitives.options.map(
  primitives.options.some(21),
  (x) => x * 2,
); // some(42)

// Filter
const positive = primitives.options.filter(
  primitives.options.some(5),
  (x) => x > 0,
); // some(5)

// Pattern matching
const label = primitives.options.match(primitives.options.some(42), {
  some: (v) => `Found: ${v}`,
  none: () => "Not found",
});

// Convert to Result
const result = primitives.options.toResult(
  primitives.options.none,
  new Error("Missing"),
);

// Combine options
const pair = primitives.options.zip(
  primitives.options.some(1),
  primitives.options.some("a"),
); // some([1, "a"])
```

## Value-Threading Pipe

Thread a value through a sequence of transformations, left to right:

```typescript
import * as fp from "@eserstack/fp";
import * as primitives from "@eserstack/primitives";

// pipe(value, f1, f2, ...) → result
const result = fp.pipe(
  primitives.results.ok(10),
  (r) => primitives.results.map(r, (x) => x * 2),
  (r) => primitives.results.flatMap(r, (x) => primitives.results.ok(String(x))),
  (r) => primitives.results.getOrElse(r, "fallback"),
);
// result: "20"
```

Full type inference with overloads for 1–9 steps.

## Function Composition (flow)

Compose functions left to right (previously named `pipe`):

```typescript
import * as fp from "@eserstack/fp";

const slugify = fp.flow(
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

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- The default export of every module is removed. Use the namespace import of the
  package root:

  ```typescript
  // Before
  import curry from "@eserstack/fp/curry";
  // After
  import * as fp from "@eserstack/fp";

  const greet = fp.curry(
    (greeting: string, name: string) => `${greeting} ${name}`,
    "Hello",
  );
  greet("Ada"); // "Hello Ada"
  ```

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
