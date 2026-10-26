# Runtime, Syntax and Types

Cross-runtime APIs, the TypeScript syntax Node can run, export types, value
checks, conversions and async returns in TypeScript code. Formatting and the
basics (`const`, semicolons, `===`, no `eval`) are enforced by oxfmt and the
oxlint rules in `.oxlintrc.json` (`eqeqeq`, `no-eval`, `no-console`,
`no-await-in-loop`, `node/no-top-level-await` and others), and the compiler
options by `tsc --noEmit`; run them rather than restating them.

## Contents

- Cross-Runtime APIs
- Module Paths
- Erasable Syntax Only
- Explicit Export Types
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

Scope: Library and package code; CLI entry points noted below

Rule: File system, process, exec, environment and path access goes through
`runtime` from `@eserstack/standards/cross-runtime` (`runtime.fs.readTextFile`,
`runtime.env.get`, `runtime.process.cwd`, `runtime.process.isStandalone`,
`runtime.exec.spawn`, `runtime.path.join`). The facade runs on Node, with a
browser entry for client code. Library code does not read Node's global
`process` or import `node:fs` or `node:child_process` itself, and no code names
another runtime's global; `validate-runtime-js-apis` reports both the `process`
and the global references. When `runtime` lacks an API the code needs, add it to
`cross-runtime` rather than calling Node directly.

Correct:

```typescript
import { runtime } from "@eserstack/standards/cross-runtime";

const text = await runtime.fs.readTextFile(configPath);
const token = runtime.env.get("GITHUB_TOKEN");
const branch = await runtime.exec.exec("git", ["branch", "--show-current"]);
```

Incorrect:

```typescript
import * as fs from "node:fs/promises";

const text = await fs.readFile(configPath, "utf8"); // bypasses the facade
const token = process.env.GITHUB_TOKEN; // global process in a library
```

**Why:** the facade is the one seam between the code and the runtime. Tests
replace `runtime` with a fake without touching the real file system, and if the
facade later collapses into `node:*` and Web APIs, that change happens inside it
and not at every call site (ADR 0005).

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

**Why:** Node sets `import.meta.dirname` for every file module, so no URL round
trip is needed; it is `undefined` only for a module that is not a file, which
the `?? "."` covers.

---

## Erasable Syntax Only

Scope: All TypeScript code

Rule: Write only TypeScript syntax that disappears when the types are stripped.
No `enum`, no `namespace` or `module` blocks, no constructor parameter
properties, no `import x = require()`. Write an enum as a `const` object with
`as const` and a union type, and assign fields in the constructor body.
`erasableSyntaxOnly` in `tsconfig.json` makes `tsc --noEmit` reject the rest.

Correct:

```typescript
export const LogLevel = { Debug: "debug", Info: "info" } as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export class Client {
  readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }
}
```

Incorrect:

```typescript
export enum LogLevel {
  Debug = "debug",
  Info = "info",
}

export class Client {
  constructor(readonly baseUrl: string) {} // parameter property
}
```

**Why:** Node runs `.ts` files by replacing the types with whitespace and
transforms nothing, so syntax that would emit code fails to load (ADR 0005).

---

## Explicit Export Types

Scope: Exported functions, constants and class members

Rule: Give every exported declaration a type that can be read without
inference: parameter and return types on exported functions and methods, and a
type annotation on an exported `const` whose value is not a literal.
`isolatedDeclarations` in `tsconfig.json` enforces it.

Correct:

```typescript
export function formatPort(port: number): string {
  return `:${port}`;
}

export const defaultOptions: ServerOptions = createOptions();
```

Incorrect:

```typescript
export function formatPort(port: number) {
  return `:${port}`; // return type inferred
}

export const defaultOptions = createOptions(); // type inferred from a call
```

**Why:** declaration files can then be produced file by file, without running
the type checker across the workspace, for the emitted build of the npm packages
(ADR 0005). A reader also sees the contract at the declaration.

---

## Global Object

Scope: Code that may run in a browser and on a server

Rule: Use `globalThis`, not `window`.

**Why:** `window` does not exist in Node or in workers; `globalThis` exists
everywhere.

---

## Explicit Checks

Scope: Conditions and defaults

Rule: Only booleans use implicit checks. Defaults use `??`, never `||`. The full
rule and examples are in coding-practices: Explicit Checks.

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
if (value instanceof Date) {
}
if (Array.isArray(value)) {
}
```

Incorrect:

```typescript
if (typeof value === "object") {
} // also true for arrays and null
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
not `await` a synchronous function, and do not mark a function `async` when it
awaits nothing (oxlint `require-await`). Every started promise is awaited or
owned (coding-practices: Owned Asynchronous Work).

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
