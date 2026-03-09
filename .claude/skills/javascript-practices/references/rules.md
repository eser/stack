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

### Iteration Over Optional Values

Scope: JS/TS

Rule: Use explicit undefined checks before iterating. Avoid nullish
coalescing that creates empty objects just to iterate over nothing.

Correct:

```typescript
const props: Record<string, unknown> | undefined = getProps();

if (props !== undefined) {
  for (const [key, value] of Object.entries(props)) {
    process(key, value);
  }
}

// Also acceptable for arrays
if (items !== undefined) {
  for (const item of items) {
    handle(item);
  }
}
```

Incorrect:

```typescript
// Creates empty object just to iterate nothing
for (const [key, value] of Object.entries(props ?? {})) {
  process(key, value);
}

// Same issue with arrays
for (const item of items ?? []) {
  handle(item);
}
```

Rationale:

- More efficient: avoids creating temporary empty objects/arrays
- More explicit: makes the conditional nature of iteration clear
- More readable: intent is obvious at a glance
- Better for debugging: easier to add logging or breakpoints

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

---

## String Prefix Extraction

### Extract Value After Known Prefix

Scope: JS/TS (HTTP headers, URIs, file paths, protocol strings)

Rule: When extracting a value after a known prefix, use `startsWith()` to validate
and `slice()` to extract. Never use `replace(prefix, "")` which can modify content
in the middle or at unexpected positions.

Correct:

```typescript
// Generic helper for any prefix extraction
function extractAfterPrefix(
  value: string | null | undefined,
  prefix: string,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!value.startsWith(prefix)) {
    return null;
  }

  const extracted = value.slice(prefix.length);
  return extracted.length > 0 ? extracted : null;
}

// Usage examples
const BEARER_PREFIX = "Bearer ";
const token = extractAfterPrefix(authHeader, BEARER_PREFIX);

const DATA_URI_PREFIX = "data:image/png;base64,";
const base64Data = extractAfterPrefix(uri, DATA_URI_PREFIX);

const FILE_PROTOCOL = "file://";
const filePath = extractAfterPrefix(url, FILE_PROTOCOL);
```

Incorrect:

```typescript
// ❌ Using replace - doesn't validate prefix position
const token = authHeader?.replace("Bearer ", "") ?? null;
// "xBearer token" → "xtoken" (wrong!)

// ❌ Using optional chaining with replace
const path = uri?.replace("file://", "") ?? null;
// "s3://file://bucket" → "s3://bucket" (wrong!)

// ❌ Hardcoded slice without prefix validation
const token = authHeader?.slice(7) ?? null;
// Doesn't check if "Bearer " actually exists
```

Rationale:
- `replace()` replaces first occurrence anywhere in the string, not just at start
- `startsWith()` + `slice()` is explicit about the expected format
- Validates the prefix is present before extracting
- Empty values after prefix are explicitly handled

---

## Deno Project Scripting

### Scripts Location

Scope: Deno projects with package.json

Rule: Keep scripts in `package.json` when project has one. Don't duplicate in
`deno.json` tasks.

Correct:

```json
// package.json
{
  "scripts": {
    "dev": "vite dev --port 3000",
    "build": "vite build",
    "start": "deno run -A .output/server/index.mjs"
  }
}

// deno.json - minimal, no tasks
{
  "name": "@scope/project",
  "imports": { "@/": "./src/" }
}
```

Incorrect:

```json
// deno.json - duplicating package.json scripts
{
  "tasks": {
    "dev": "deno run -A npm:vite dev --port 3000",
    "build": "deno run -A npm:vite build"
  }
}
```

### Avoid Redundant Scripts

Scope: Deno projects

Rule: Don't add wrapper scripts for built-in Deno commands. Use `deno lint`,
`deno fmt`, `deno install --allow-scripts` directly.

Correct:

```bash
deno lint
deno fmt
deno install --allow-scripts
```

Incorrect:

```json
{
  "scripts": {
    "lint": "deno lint",
    "fmt": "deno fmt",
    "install:deps": "deno install --allow-scripts"
  }
}
```

### Use Package Aliases

Scope: Deno projects with npm dependencies

Rule: When a package is aliased in dependencies, use the alias directly instead
of `deno run -A npm:package-name`.

Correct:

```json
// package.json
{
  "devDependencies": {
    "vite": "npm:rolldown-vite@^7.3.1"
  },
  "scripts": {
    "dev": "vite dev --port 3000",
    "build": "vite build"
  }
}
```

Incorrect:

```json
{
  "scripts": {
    "dev": "deno run -A npm:rolldown-vite dev --port 3000",
    "build": "deno run -A npm:rolldown-vite build"
  }
}
```

### Workspace Configuration

Scope: Deno workspaces

Rule: Only root `deno.json` can have workspace-level keys like `nodeModulesDir`,
`compilerOptions`, `lint`, `fmt`. Member projects have minimal config.

Correct:

```json
// Root deno.json
{
  "nodeModulesDir": "auto",
  "workspace": ["./apps/webclient"],
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  },
  "lint": { "rules": { "tags": ["recommended"] } },
  "fmt": { "lineWidth": 120 }
}

// apps/webclient/deno.json - minimal
{
  "name": "@aya/webclient",
  "version": "1.0.0",
  "imports": { "@/": "./src/" }
}
```

Incorrect:

```json
// apps/webclient/deno.json - workspace member with root-only keys
{
  "name": "@aya/webclient",
  "nodeModulesDir": "auto",
  "compilerOptions": { "jsx": "react-jsx" }
}
```

---

## React Component Patterns

### CSS Modules with @apply

Scope: React components with Tailwind CSS

Rule: Use CSS Modules with Tailwind `@apply` directive as primary styling
approach. Each component should have a co-located `*.module.css` file with
semantic class names. Direct Tailwind classes should be used sparingly.

Correct:

```css
/* product-card.module.css */
.product-card {
  @apply border rounded-lg p-4 shadow-md flex flex-col gap-2;

  & .title {
    @apply text-xl font-bold mb-2;
  }

  & .description {
    @apply text-sm text-gray-600;
  }
}
```

```typescript
// ProductCard.tsx
import styles from "./product-card.module.css";

type ProductCardProps = {
  product: { name: string; description: string };
};

function ProductCard(props: ProductCardProps) {
  return (
    <div className={styles["product-card"]}>
      <h3 className={styles.title}>{props.product.name}</h3>
      <p className={styles.description}>{props.product.description}</p>
    </div>
  );
}
```

Incorrect:

```typescript
// ❌ Inline Tailwind classes everywhere
function ProductCard(props: ProductCardProps) {
  return (
    <div className="border rounded-lg p-4 shadow-md flex flex-col gap-2">
      <h3 className="text-xl font-bold mb-2">{props.product.name}</h3>
      <p className="text-sm text-gray-600">{props.product.description}</p>
    </div>
  );
}

// ❌ Inline styles
function ProductCard(props: ProductCardProps) {
  return (
    <div style={{ border: "1px solid", padding: "16px" }}>
      {props.product.name}
    </div>
  );
}
```

**When Direct Tailwind is Acceptable:**

- Very simple, non-reusable micro-adjustments
- Global layout containers in top-level pages
- Use `cn` utility when combining: `className={cn(styles.button, "mt-2")}`

---

### Single Props Object Pattern

Scope: React components

Rule: Accept single props object instead of destructuring in function signature.
Access via `props.propertyName` for better readability and refactoring.

Correct:

```typescript
type UserProfileProps = {
  userId: string;
  showActions: boolean;
};

function UserProfile(props: UserProfileProps) {
  return (
    <div>
      <h1>User: {props.userId}</h1>
      {props.showActions && <button type="button">Edit</button>}
    </div>
  );
}
```

Incorrect:

```typescript
// ❌ Destructured props in signature
function UserProfile({ userId, showActions }: UserProfileProps) {
  return (
    <div>
      <h1>User: {userId}</h1>
      {showActions && <button type="button">Edit</button>}
    </div>
  );
}
```

---

### Named Exports for Components

Scope: React components

Rule: Prefer named exports for React components. Default exports only for
framework-required files (page.tsx, layout.tsx).

Correct:

```typescript
// UserProfile.tsx
export function UserProfile(props: UserProfileProps) {
  return <div>{props.name}</div>;
}

// page.tsx (framework required)
export default function HomePage() {
  return <main>...</main>;
}
```

Incorrect:

```typescript
// ❌ Default export for regular component
function UserProfile(props: UserProfileProps) {
  return <div>{props.name}</div>;
}
export default UserProfile;

// ❌ Re-export as default
export { UserProfile as default };
```

---

### React v19 Compiler Compatibility

Scope: React v19+ projects

Rule: Write compiler-friendly code. Minimize manual memoization. The React
compiler handles optimization automatically.

Correct:

```typescript
// ✅ Let compiler optimize
function ExpensiveList(props: { items: Item[] }) {
  const sorted = props.items.toSorted((a, b) => a.name.localeCompare(b.name));
  return (
    <ul>
      {sorted.map((item) => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  );
}
```

Incorrect:

```typescript
// ❌ Manual memoization without profiling evidence
function ExpensiveList(props: { items: Item[] }) {
  const sorted = useMemo(
    () => props.items.toSorted((a, b) => a.name.localeCompare(b.name)),
    [props.items],
  );
  return (
    <ul>
      {sorted.map((item) => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  );
}
```

**Guidelines:**

- Favor idiomatic React patterns
- Only add `useMemo`/`useCallback` after profiling shows benefit
- React Strict Mode enabled for better development experience

---

## Testability

### Pure Function Extraction

Scope: JS/TS (Deno-tested frontend utilities)

Rule: Pure functions should be kept free of environment/framework dependencies
(like `import.meta.env`, Vite-specific APIs, React context) to enable direct
testing with Deno's test runner. When a utility file needs both pure logic and
environment config, extract the pure logic into a separate file.

Correct:

```typescript
// locale-utils.ts — pure functions, no import.meta.env
export const SUPPORTED_LOCALES = ["en", "tr", "fr"] as const;
export function isValidLocale(locale: string): boolean {
  return SUPPORTED_LOCALES.includes(locale as any);
}

// config.ts — re-exports pure functions + adds env-dependent config
export { SUPPORTED_LOCALES, isValidLocale } from "@/lib/locale-utils.ts";
export const siteConfig = {
  host: import.meta.env.VITE_SITE_URL,
};
```

```typescript
// seo-utils.ts — pure functions with explicit parameters
export function generateMetaTags(
  meta: SeoMeta,
  defaults: { host: string; name: string; defaultImage: string },
): MetaTag[] { /* ... */ }

// seo.ts — thin wrapper injecting siteConfig
import { generateMetaTags as generateMetaTagsPure } from "@/lib/seo-utils.ts";
import { siteConfig } from "@/config.ts";
const DEFAULTS = { host: siteConfig.host, name: siteConfig.name, defaultImage: `${siteConfig.host}/og-image.png` };
export function generateMetaTags(meta: SeoMeta) {
  return generateMetaTagsPure(meta, DEFAULTS);
}
```

Incorrect:

```typescript
// ❌ Pure logic mixed with env dependency — untestable with Deno
import { siteConfig } from "@/config.ts"; // transitively imports import.meta.env
export function buildUrl(locale: string, ...segments: string[]) {
  return `${siteConfig.host}/${locale}/${segments.join("/")}`;
}
```

Naming convention: `foo-utils.ts` for pure functions, `foo.ts` for the
config-aware wrapper that re-exports and/or delegates to the utils file.

### Snapshot Testing Pattern

Scope: Deno test files (`*.test.ts`)

Rule: Use `assertSnapshot` from `@std/testing/snapshot` for anti-regression
tests. Test files need `/// <reference lib="deno.ns" />` since the project
tsconfig targets Vite/React. Use `--no-check` flag when Deno's type checker
conflicts with Vite-compatible types (e.g., Zod v4).

Correct:

```typescript
/// <reference lib="deno.ns" />
import { assertSnapshot } from "@std/testing/snapshot";
import { myFunction } from "./my-utils.ts";

Deno.test("myFunction - descriptive case name", async (t) => {
  await assertSnapshot(t, myFunction("input"));
});
```

Test commands (in package.json):

```json
{
  "test": "deno test --no-check --allow-read --allow-write=. src/",
  "test:update": "deno test --no-check --allow-read --allow-write=. -- --update src/",
  "test:ci": "deno test --no-check --allow-read src/"
}
```

---

## Translation System

### Translation Key Format

Scope: Internationalized React applications

Rule: Use English text as translation keys. Add translations to ALL language
files. Use fallbacks for missing translations.

Correct:

```typescript
// ✅ English text as key
t("Auth", "Login with GitHub")
t("Home", "AYA the Open Source Network")

// ✅ With fallback
t("Section", "Key") || "Fallback text"
```

Incorrect:

```typescript
// ❌ Snake case keys
t("Auth.login_with_github")
t("Home.main_title")
```

### Server vs Client Components

Scope: Next.js/React Server Components

Rule: Use `getTranslations` for Server Components, `useTranslations` hook for
Client Components.

Correct:

```typescript
// ✅ React Server Component
import { getTranslations } from "@/modules/i18n/get-translations.tsx";

async function MyServerComponent() {
  const { t, locale } = await getTranslations();
  return <h1>{t("Home", "Welcome")}</h1>;
}

// ✅ Client Component
"use client";
import { useTranslations } from "@/modules/i18n/use-translations.tsx";

function MyClientComponent() {
  const { t, locale } = useTranslations();
  return <button type="button">{t("Layout", "Change theme")}</button>;
}
```
