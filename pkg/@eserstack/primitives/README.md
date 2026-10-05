# 🧱 [@eserstack/primitives](./)

> **eserstack Foundation** —
> [eser/stack on GitHub](https://github.com/eser/stack) **Install:**
> `pnpm add jsr:@eserstack/primitives`

The type foundation for the eserstack FP ecosystem.

## Vision

`@eserstack/primitives` defines the `Result` and `Option` types that the rest of
the ecosystem passes around, the functions that create, inspect and combine
them, and runtime type guards and type-level helpers. Every other package in the
ecosystem builds on these primitives.

## Design Philosophy

- **Types describe shapes.** `Result<T, E>`, `Option<T>`, `Ok<T>`, `Fail<E>`,
  `Some<T>`, `None` — discriminated unions with a `_tag` field.
- **Constructors create values.** `ok()`, `fail()`, `some()`, `none` — minimal
  factory functions.
- **Type guards narrow them.** `isOk()`, `isFail()`, `isSome()`, `isNone()` —
  predicate functions for type narrowing.
- **Combinators live next to their type.** `primitives.results` also exports
  `map`, `flatMap`, `mapError`, `match`, `getOrElse`, `tryCatch`, `all`, `any`
  and `tap`, and `primitives.options` exports `map`, `flatMap`, `filter`,
  `match`, `orElse`, `zip` and `toResult`. Each takes the result or option as
  its first argument; to chain them in `fp.pipe`, wrap each call in an arrow
  function, as in `(result) => primitives.results.map(result, double)`.
- **General utilities live elsewhere.** Functions over arrays, objects and other
  functions (`pipe`, `flow`, `groupBy`, `deepMerge` and the rest) are in
  [`@eserstack/fp`](../fp/), and multi-step workflows are in
  [`@eserstack/functions`](../functions/).

## How It Fits

```text
@eserstack/primitives  →  @eserstack/fp  →  @eserstack/functions
   (this package)     (array, object   (higher-level
    types,             and function     compositions)
    constructors,      utilities)
    combinators)
```

- **vs `@eserstack/fp`**: Primitives defines `Result<T, E>` and the `map`,
  `flatMap` and `match` that work on it; fp gives you `pipe` and `flow`, which
  chain one-argument functions such as those calls wrapped in arrow functions,
  plus utilities for arrays and objects.
- **vs `@eserstack/functions`**: Primitives defines the data types — functions
  provides multi-step workflows (`run()`, `collect()`, `Task`) that orchestrate
  them.

## Quick Start

```typescript
import * as primitives from "@eserstack/primitives";

// Result — explicit error handling
const divide = (
  a: number,
  b: number,
): primitives.results.Result<number, string> =>
  b === 0
    ? primitives.results.fail("Division by zero")
    : primitives.results.ok(a / b);

const result = divide(10, 2);
if (primitives.results.isOk(result)) {
  console.log(result.value); // 5
}

// Option — nullable value handling
const find = (id: string): primitives.options.Option<string> =>
  id === "1" ? primitives.options.some("Alice") : primitives.options.none;

const user = find("1");
if (primitives.options.isSome(user)) {
  console.log(user.value); // "Alice"
}
```

### Combinators

Each combinator takes the result or option as its first argument. A failure or a
missing value passes through `map` and `flatMap` untouched, and `match` or
`getOrElse` turns the outcome into a plain value:

```typescript
import * as primitives from "@eserstack/primitives";

const parsed = primitives.results.tryCatch(() => JSON.parse('{"port":8080}'));
const port = primitives.results.map(parsed, (config) => Number(config.port));
const message = primitives.results.match(port, {
  ok: (value) => `listening on ${value}`,
  fail: (error) => `bad config: ${String(error)}`,
});
// "listening on 8080"

const nicknames = new Map([["ada", "Countess"]]);
const label = primitives.options.getOrElse(
  primitives.options.map(
    primitives.options.fromNullable(nicknames.get("grace")),
    (value) => value.toUpperCase(),
  ),
  "ANONYMOUS",
);
// "ANONYMOUS"
```

### Generator Protocol (Do-Notation)

`Result` values implement the iterator protocol, enabling `yield*` unwrapping in
generator-based composition (see `@eserstack/functions`):

```typescript
import * as primitives from "@eserstack/primitives";
import * as functions from "@eserstack/functions";

const result = await functions.run(async function* () {
  const a = yield* primitives.results.ok(5); // unwraps to 5
  const b = yield* primitives.results.ok(10); // unwraps to 10
  return a + b; // 15
});
// result: ok(15)
```

## Exports

Each module is a namespace on the package root (`primitives.results`,
`primitives.options` and so on) and is also published under its own sub-path.

| Namespace               | Sub-path                            | Contents                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `primitives.results`    | `@eserstack/primitives/results`     | `Result<T,E>`, `Ok<T>`, `Fail<E>`, `ok()`, `fail()`, `isOk()`, `isFail()`; combinators `map`, `flatMap`, `flatMapW`, `mapError`, `flatMapError`, `flatMapErrorW`, `match`, `tap`, `tapError`; `getOrElse`, `getOrThrow`, `getOrNull`, `getOrUndefined`; `all`, `any`; `tryCatch`, `tryCatchAsync`, `fromPromise`, `toPromise`    |
| `primitives.options`    | `@eserstack/primitives/options`     | `Option<T>`, `Some<T>`, `None`, `some()`, `none`, `isSome()`, `isNone()`, `fromNullable()`, `fromFalsy()`; combinators `map`, `flatMap`, `filter`, `match`, `orElse`, `tap`, `tapNone`, `zip`, `zipWith`, `contains`, `exists`; `getOrElse`, `getOrThrow`, `getOrNull`, `getOrUndefined`; `all`, `any`; `toResult`, `fromResult` |
| `primitives.functions`  | `@eserstack/primitives/functions`   | Generic function and class type definitions                                                                                                                                                                                                                                                                                      |
| `primitives.promises`   | `@eserstack/primitives/promises`    | `Promisable<T>` and promise utility types                                                                                                                                                                                                                                                                                        |
| `primitives.typeGuards` | `@eserstack/primitives/type-guards` | Runtime type guards (`isString`, `isNumber`, `isDefined`, etc.)                                                                                                                                                                                                                                                                  |
| `primitives.typeSlices` | `@eserstack/primitives/type-slices` | Tuple utility types (`First`, `Last`, `ArgList`, etc.)                                                                                                                                                                                                                                                                           |

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
