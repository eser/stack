# JavaScript/TypeScript Practices - Detailed Rules

## Modules

### Exports

Scope: JS/TS

Rule: Always use direct named exports with export keyword. Avoid
default exports.

Correct:

```typescript
export function buildCommand() {}
export const CONFIG_PATH = "./config";
export class UserService {}
export type BuildOptions = {};
```

Incorrect:

```typescript
function buildCommand() {}
const CONFIG_PATH = "./config";
export { buildCommand, CONFIG_PATH }; // indirect export

export default buildCommand; // default export
```

### Imports

Scope: JS/TS

Rule: Prefer namespace imports to prevent naming collisions.

Correct:

```typescript
import * as path from "@std/path";
import * as fs from "@std/fs";

const filePath = path.join(dir, "config.ts");
const exists = await fs.exists(filePath);
```

Incorrect:

```typescript
import { join, resolve } from "@std/path";
import { copy, exists } from "@std/fs";

const filePath = join(dir, "config.ts"); // potential collision with other 'join'
```

Exception: Single function imports from small modules:

```typescript
import { assertEquals } from "@std/assert";
```

### Import Paths

Scope: JS/TS

Rule: Use explicit file extensions and paths. Avoid sloppy imports.

Correct:

```typescript
import { add } from "./math/add.ts";
import { ConsoleLogger } from "./loggers/index.ts";
import { buildConfig } from "../config/build.ts";
```

Incorrect:

```typescript
import { add } from "./math/add"; // missing extension
import { ConsoleLogger } from "./loggers"; // ambiguous directory import
```

---

## Runtime

### Module Paths

Scope: JS/TS ES Modules (Node 20.11+, Deno, Bun)

Rule: Use import.meta.dirname
over dirname(fromFileUrl(import.meta.url))

Correct:

```typescript
const root = projectRoot ?? import.meta.dirname;
```

Incorrect:

```typescript
import { dirname } from "@std/path";
import { fromFileUrl } from "@std/url";
const root = dirname(fromFileUrl(import.meta.url));
```

### Path Context Distinction

Scope: JS/TS (Deno, Node, Bun)

Rule: Use import.meta for module paths, cwd() for
user context

Module-relative (package internals):

```typescript
const templateDir = new URL(`../templates/${name}/`, import.meta.url).pathname;
const configPath = join(import.meta.dirname, "config", "defaults.json");
```

User context (CLI working directory):

```typescript
export function buildCommand(options: { projectRoot?: string }) {
  const userDir = options.projectRoot ?? Deno.cwd();
  const userConfig = join(userDir, "config.ts");
}
```

### Optional Path Parameters

Scope: JS/TS (CLI tools, build systems, test utilities)

Rule: Add optional
projectRoot?: string parameter. Enables testing without global state changes.

Correct:

```typescript
export async function analyzeComponents(
  srcDir: string,
  projectRoot?: string,
): Promise<Component[]> {
  const root = projectRoot ?? import.meta.dirname;
}
```

Incorrect:

```typescript
export async function analyzeComponents(srcDir: string): Promise<Component[]> {
  const root = Deno.cwd(); // hardcoded, untestable
}
```

### Global Object

Scope: JS/TS (Browser, Deno, Node, Bun)

Rule: Use globalThis instead of window.
Works across all runtimes.

Correct:

```typescript
const isDefined = typeof globalThis.localStorage !== "undefined";
globalThis.myGlobal = { value: 1 };
```

Incorrect:

```typescript
const isDefined = typeof window.localStorage !== "undefined"; // fails in Node/Deno
```

---

## Syntax

### Variable Declaration

Scope: JS/TS

Rule: Prefer const over let. Use const by default, only use let
when reassignment required.

Correct:

```typescript
const userName = "John";
const config = { port: 8000 };
let counter = 0;
counter++; // reassignment needed
```

Incorrect:

```typescript
let userName = "John"; // never reassigned
```

### Semicolons

Scope: JS/TS

Rule: Add semicolons always. Reduces bugs from automatic semicolon
insertion.

Correct:

```typescript
const user = getUser();
const name = user.name;
return name;
```

### Equality Checking

Scope: JS/TS

Rule: Use strict equality (===). Avoids implicit type coercion.

Correct:

```typescript
if (value === 0) {}
if (user === null) {}
```

Incorrect:

```typescript
if (value == 0) {} // matches 0, "0", false, ""
```

### Operators

Scope: JS/TS

Rule: Use ?? for defaults. Coalesces only on null/undefined, not
falsy values.

Correct:

```typescript
const value = userInput ?? "default";
const port = config.port ?? 8000;
```

Incorrect:

```typescript
const value = userInput || "default"; // fails if userInput is ""
const port = config.port || 8000; // fails if port is 0
```

### String Methods

Scope: JS/TS

Rule: Use slice() instead of substring() or substr(). substr()
deprecated.

Correct:

```typescript
const text = "Hello World";
const result = text.slice(0, 5); // "Hello"
const last = text.slice(-5); // "World"
```

### String Formatting

Scope: JS/TS

Rule: Prefer template strings over concatenation.

Correct:

```typescript
const greeting = `Hello, ${user.name}!`;
const url = `/api/users/${userId}/posts/${postId}`;
```

Incorrect:

```typescript
const greeting = "Hello, " + user.name + "!";
```

### Delete Operator

Scope: JS/TS

Rule: Use delete for object properties only.

Correct:

```typescript
const obj = { name: "John", age: 30 };
delete obj.age; // removes property
```

For arrays, use splice() or filter():

```typescript
const arr = [1, 2, 3];
arr.splice(1, 1); // removes element
```

### Function Arguments

Scope: JS/TS

Rule: Use rest operator instead of arguments object.

Correct:

```typescript
function sum(...numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0);
}
```

### Array Iteration

Scope: JS/TS

Rule: Prefer for..of for array values.

Correct:

```typescript
for (const item of items) {
  process(item);
}

for (const [index, item] of items.entries()) {
  console.log(index, item);
}
```

Exception: Use for loop when break/continue or index manipulation needed.

### Dangerous Features

Scope: JS/TS

Rule: Avoid eval, prototype manipulation, Object.defineProperty.

Incorrect:

```typescript
eval("const x = 1"); // security risk
Array.prototype.myMethod = function () {}; // pollutes global
```

---

## Types

### String to Number Conversion

Scope: JS/TS

Rule: Use Number() for conversions. Makes intent clearer than
unary + operator.

Correct:

```typescript
const value = Number(userInput);
const port = Number(process.env.PORT ?? "8000");
```

Incorrect:

```typescript
const value = +userInput; // unclear intent
```

### Type Checking

Scope: JS/TS

Rule: Avoid typeof operator. Use instanceof or .constructor.

Correct:

```typescript
const value = [1, 2, 3];
if (value instanceof Array) {}
if (value.constructor === Array) {}
```

Incorrect:

```typescript
if (typeof value === "object") {} // true for arrays, objects, null
```

Exception: Checking for undefined:

```typescript
if (typeof someVar === "undefined") {} // acceptable
```

### Null vs Undefined

Scope: JS/TS

Rule: Prefer null over undefined. Makes intent explicit.

Correct:

```typescript
let user: User | null = null;

function findUser(id: string): User | null {
  return users.get(id) ?? null;
}
```

### Truthy/Falsy Checks

Scope: JS/TS

Rule: Avoid truthy/falsy checks unless boolean type. Use full
conditions.

Correct:

```typescript
if (array.length === 0) {}
if (user !== null) {}
if (value !== 0) {}
if (isActive) {} // boolean type
```

Incorrect:

```typescript
if (!array.length) {} // false for length 0
if (user) {} // false for null, undefined, 0, ""
```

---

## Async

### Consistent Async Returns

Scope: JS/TS

Rule: Use `return await` consistently in async functions. Prefer explicit
awaiting over implicit promise returns.

Correct:

```typescript
async function fetchUser(id: string): Promise<User> {
  return await userRepository.findById(id);
}

async function processData(): Promise<Result> {
  try {
    return await riskyOperation();
  } catch (error) {
    return await fallbackOperation();
  }
}
```

Incorrect:

```typescript
async function fetchUser(id: string): Promise<User> {
  return userRepository.findById(id); // implicit return, worse stack trace
}

async function processData(): Promise<Result> {
  try {
    return riskyOperation(); // BUG: rejection bypasses catch block!
  } catch (error) {
    return fallbackOperation();
  }
}
```

Rationale:
- Better stack traces for debugging
- Correct error handling in try-catch (without await, rejections bypass catch)
- No performance penalty (ECMA-262 updated)
- Deno's require-await lint rule compatibility
- ESLint's no-return-await is now deprecated
