# 🧱 [@eser/primitives](./)

The type foundation for the eserstack FP ecosystem.

## Vision

`@eser/primitives` provides the smallest possible building blocks: **type
definitions**, **constructors**, and **type guards**. Every other package in the
ecosystem builds on these primitives. This package has no opinions about how you
_use_ the types — it only defines what they _are_.

## Design Philosophy

- **Types describe shapes.** `Result<T, E>`, `Option<T>`, `Ok<T>`, `Fail<E>`,
  `Some<T>`, `None` — discriminated unions with a `_tag` field.
- **Constructors create values.** `ok()`, `fail()`, `some()`, `none` — minimal
  factory functions.
- **Type guards narrow them.** `isOk()`, `isFail()`, `isSome()`, `isNone()` —
  predicate functions for type narrowing.
- **Nothing more.** No transformations, no combinators, no composition. For
  `map`, `flatMap`, `match` and other operations on these types, see
  [`@eser/fp`](../fp/).

## How It Fits

```
@eser/primitives  →  @eser/fp  →  @eser/functions
   (this package)     (pure FP      (higher-level
    types +            combinators)   compositions)
    constructors)
```

- **vs `@eser/fp`**: Primitives defines `Result<T, E>` — fp gives you
  `map`/`flatMap`/`match` to work with it.
- **vs `@eser/functions`**: Primitives defines the data types — functions
  provides multi-step workflows (`run()`, `collect()`, `Task`) that orchestrate
  them.

## Quick Start

```typescript
import { fail, isFail, isOk, ok, type Result } from "@eser/primitives/results";
import {
  isNone,
  isSome,
  none,
  type Option,
  some,
} from "@eser/primitives/options";

// Result — explicit error handling
const divide = (a: number, b: number): Result<number, string> =>
  b === 0 ? fail("Division by zero") : ok(a / b);

const result = divide(10, 2);
if (isOk(result)) {
  console.log(result.value); // 5
}

// Option — nullable value handling
const find = (id: string): Option<string> => id === "1" ? some("Alice") : none;

const user = find("1");
if (isSome(user)) {
  console.log(user.value); // "Alice"
}
```

### Generator Protocol (Do-Notation)

`Result` values implement the iterator protocol, enabling `yield*` unwrapping in
generator-based composition (see `@eser/functions`):

```typescript
import { fail, ok } from "@eser/primitives/results";
import { run } from "@eser/functions";

const result = await run(async function* () {
  const a = yield* ok(5); // unwraps to 5
  const b = yield* ok(10); // unwraps to 10
  return a + b; // 15
});
// result: ok(15)
```

## Exports

| Subpath                        | Contents                                                                  |
| ------------------------------ | ------------------------------------------------------------------------- |
| `@eser/primitives/results`     | `Result<T,E>`, `Ok<T>`, `Fail<E>`, `ok()`, `fail()`, `isOk()`, `isFail()` |
| `@eser/primitives/options`     | `Option<T>`, `Some<T>`, `None`, `some()`, `none`, `isSome()`, `isNone()`  |
| `@eser/primitives/functions`   | Generic function and class type definitions                               |
| `@eser/primitives/promises`    | `Promisable<T>` and promise utility types                                 |
| `@eser/primitives/type-guards` | Runtime type guards (`isString`, `isNumber`, `isDefined`, etc.)           |
| `@eser/primitives/type-slices` | Tuple utility types (`First`, `Last`, `ArgList`, etc.)                    |

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
