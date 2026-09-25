# Runtime, Syntax and Types

Cross-runtime APIs, value checks, conversions and async returns in TypeScript
code. Formatting and the basics (`const`, semicolons, `===`, no `eval`) are
enforced by `deno fmt` and the lint rules in the root `deno.json` (`eqeqeq`,
`no-eval`, `no-console`, `no-await-in-loop`, `no-top-level-await`,
`verbatim-module-syntax` and others); run them rather than restating them.

## Contents

- Cross-Runtime APIs
- Module Paths
- Global Object
- Explicit Checks
- Null vs Undefined
- Type Checking
- String to Number Conversion
- String Methods
- Array Iteration
- Iteration Over Optional Values
- Dangerous Features
- Consistent Async Returns

---

## Cross-Runtime APIs

Scope: All `@eserstack/*` packages

Rule: File system, process, environment and path access goes through `runtime`
from `@eserstack/standards/cross-runtime` (`runtime.fs.readTextFile`,
`runtime.env.get`, `runtime.process.cwd`, `runtime.path.join`). Never call
`Deno.*` or read `process.env` in library code. CLI-only code may call `Deno.*`
when the abstraction does not expose the API yet; prefer adding it to
`cross-runtime` instead.

Correct:

```typescript
import { runtime } from "@eserstack/standards/cross-runtime";

const text = await runtime.fs.readTextFile(configPath);
const token = runtime.env.get("GITHUB_TOKEN");
```

Incorrect:

```typescript
const text = await Deno.readTextFile(configPath); // Deno only
const token = process.env.GITHUB_TOKEN; // Node only
```

**Why:** packages publish to JSR and npm and run on Deno, Node and Bun, and
tests replace `runtime` without touching the real file system.

---

## Module Paths

Scope: Resolving files that ship with a package

Rule: Use `import.meta.dirname` for the module's directory, not
`dirname(fromFileUrl(import.meta.url))`. Package files resolve from
`import.meta.dirname`; project files resolve from a `projectRoot` parameter that
defaults to the working directory (coding-practices: No Machine-Specific
Assumptions).

Correct:

```typescript
const templatesDir = runtime.path.join(import.meta.dirname ?? ".", "templates");
```

**Why:** `import.meta.dirname` works in Deno, Node 20.11+ and Bun without a URL
round trip.

---

## Global Object

Scope: Code that may run in a browser and on a server

Rule: Use `globalThis`, not `window`.

**Why:** `window` does not exist in Deno, Node or workers.

---

## Explicit Checks

Scope: Conditions and defaults

Rule: Only booleans use implicit checks. Defaults use `??`, never `||`. The full
rule and examples are in coding-practices: Explicit Checks (CRITICAL).

Correct:

```typescript
const port = config.port ?? 8000;
if (items.length === 0) return;
```

Incorrect:

```typescript
const port = config.port || 8000; // replaces a configured 0
if (!items.length) return;
```

---

## Null vs Undefined

Scope: Values that can be absent

Rule: Represent "no value" with `null` in return types and fields you define.
Keep `undefined` for optional parameters and properties.

Correct:

```typescript
function findUser(id: string): User | null {
  return users.get(id) ?? null;
}
```

**Why:** one absent-value marker per API makes `=== null` the only check a
caller needs.

---

## Type Checking

Scope: Runtime type checks

Rule: Check object types with `instanceof` (or `Array.isArray`), not
`typeof x === "object"`. `typeof` is fine for primitives and for
`typeof x === "undefined"`.

Correct:

```typescript
if (value instanceof Date) {}
if (Array.isArray(value)) {}
```

Incorrect:

```typescript
if (typeof value === "object") {} // also true for arrays and null
```

---

## String to Number Conversion

Scope: Parsing numbers from strings

Rule: Use `Number(text)` and check the result with `Number.isNaN`. Do not use
unary `+` or `parseInt` without a radix.

Correct:

```typescript
const raw = runtime.env.get("PORT") ?? "8000";
const port = Number(raw);
if (Number.isNaN(port)) throw new Error(`PORT "${raw}" is not a number`);
```

---

## String Methods

Scope: Taking parts of strings

Rule: Use `slice()`, not `substring()` or the deprecated `substr()`. To take the
value after a known prefix, see coding-practices: Prefix Extraction.

---

## Array Iteration

Scope: Loops over arrays

Rule: Use `for...of` for values and `for (const [i, item] of items.entries())`
when the index is needed. Use a classic `for` loop only when the index itself is
manipulated.

---

## Iteration Over Optional Values

Scope: Iterating a value that may be `undefined`

Rule: Check for `undefined` before the loop instead of iterating a fallback
empty object or array.

Correct:

```typescript
if (props !== undefined) {
  for (const [key, value] of Object.entries(props)) {
    process(key, value);
  }
}
```

Incorrect:

```typescript
for (const [key, value] of Object.entries(props ?? {})) {
  process(key, value);
}
```

**Why:** the condition stays visible, and no temporary object is created only to
loop over nothing.

---

## Dangerous Features

Scope: All code

Rule: No `eval`, `new Function`, prototype changes or `Object.defineProperty` on
shared objects. The rule and its reasons are in coding-practices: No Runtime
Code Generation or Global Patching.

---

## Consistent Async Returns

Scope: Async functions

Rule: Write `return await` when returning a promise from an async function. Do
not `await` a synchronous function (`no-sync-fn-in-async-fn` lint rule). Every
started promise is awaited or owned (coding-practices: Owned Asynchronous Work).

Correct:

```typescript
async function processData(): Promise<Result> {
  try {
    return await riskyOperation();
  } catch (error) {
    return await fallbackOperation(error);
  }
}
```

Incorrect:

```typescript
async function processData(): Promise<Result> {
  try {
    return riskyOperation(); // a rejection skips the catch block
  } catch (error) {
    return fallbackOperation(error);
  }
}
```

**Why:** without `await` a rejection escapes the surrounding `try`, and the
async frame is missing from the stack trace. It has no performance cost.
