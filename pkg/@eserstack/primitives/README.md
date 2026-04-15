# 🧱 [@eserstack/primitives](./)

> **eserstack Foundation** —
> [eser/stack on GitHub](https://github.com/eser/stack) **Install:**
> `pnpm add jsr:@eserstack/primitives`

The type foundation for the eserstack FP ecosystem.

## Vision

`@eserstack/primitives` provides the smallest possible building blocks: **type
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
  [`@eserstack/fp`](../fp/).

## How It Fits

```
@eserstack/primitives  →  @eserstack/fp  →  @eserstack/functions
   (this package)     (pure FP      (higher-level
    types +            combinators)   compositions)
    constructors)
```

- **vs `@eserstack/fp`**: Primitives defines `Result<T, E>` — fp gives you
  `map`/`flatMap`/`match` to work with it.
- **vs `@eserstack/functions`**: Primitives defines the data types — functions
  provides multi-step workflows (`run()`, `collect()`, `Task`) that orchestrate
  them.

## Quick Start

```typescript
import {
  fail,
  isFail,
  isOk,
  ok,
  type Result,
} from "@eserstack/primitives/results";
import {
  isNone,
  isSome,
  none,
  type Option,
  some,
} from "@eserstack/primitives/options";

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
generator-based composition (see `@eserstack/functions`):

```typescript
import { fail, ok } from "@eserstack/primitives/results";
import { run } from "@eserstack/functions";

const result = await run(async function* () {
  const a = yield* ok(5); // unwraps to 5
  const b = yield* ok(10); // unwraps to 10
  return a + b; // 15
});
// result: ok(15)
```

## Exports

| Subpath                             | Contents                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `@eserstack/primitives/results`     | `Result<T,E>`, `Ok<T>`, `Fail<E>`, `ok()`, `fail()`, `isOk()`, `isFail()` |
| `@eserstack/primitives/options`     | `Option<T>`, `Some<T>`, `None`, `some()`, `none`, `isSome()`, `isNone()`  |
| `@eserstack/primitives/functions`   | Generic function and class type definitions                               |
| `@eserstack/primitives/promises`    | `Promisable<T>` and promise utility types                                 |
| `@eserstack/primitives/type-guards` | Runtime type guards (`isString`, `isNumber`, `isDefined`, etc.)           |
| `@eserstack/primitives/type-slices` | Tuple utility types (`First`, `Last`, `ArgList`, etc.)                    |

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
