# Modules and Imports

How TypeScript modules in this repository export, import and name their paths.

## Contents

- Exports
- Imports
- Import Paths
- Avoid Re-exports

---

## Exports

Scope: All TypeScript modules

Rule: Export with the `export` keyword on the declaration. No default exports,
except where a framework requires one (see react.md: Named Exports for
Components). No `export { a, b }` lists at the bottom of a file.

Correct:

```typescript
export function buildCommand() {}
export const CONFIG_PATH = "./config";
export type BuildOptions = { readonly dryRun: boolean };
```

Incorrect:

```typescript
function buildCommand() {}
export { buildCommand }; // indirect export
export default buildCommand; // default export
```

**Why:** the export is visible where the symbol is defined, and every importer
uses the same name, so a rename is a single grep.

---

## Imports

Scope: All TypeScript imports

Rule: Always import as a namespace with `import * as`. The
`validate-code-conventions` validator enforces it on new code. Name the alias
after the module: `path`, `fs`, `semver` for the standard library, the package's
short name (`shell`, `primitives`, `functions`, `standards`) for workspace
packages. When a package's `mod.ts` exposes sub-modules as namespaces, import
the package once and reach sub-modules with dot notation.

The only exception:

- `import { runtime } from "@eserstack/standards/cross-runtime";`

Existing named imports in the code are not a precedent for new ones.

Correct:

```typescript
import * as path from "@std/path";
import * as shell from "@eserstack/shell";
import * as primitives from "@eserstack/primitives";
import { runtime } from "@eserstack/standards/cross-runtime";

const filePath = path.join(dir, "config.ts");
const output = shell.formatting.createOutput();
const result = primitives.results.ok(value);
```

Incorrect:

```typescript
import { join } from "@std/path"; // named import from a package
import * as shellFormatting from "@eserstack/shell/formatting"; // root exports it
import * as shellExec from "@eserstack/shell/exec";

const filePath = join(dir, "config.ts"); // which join?
```

**Why:** a namespace shows where every symbol comes from and cannot collide with
a local name; the root-package form keeps one import per dependency.

---

## Import Paths

Scope: Relative imports

Rule: Write the full file path with its extension. A package's entry point is
`mod.ts`; never import a directory. The root `deno.json` enables
`sloppy-imports` for compatibility, but new code does not rely on it. Use
`import type` for type-only imports; the `verbatim-module-syntax` lint rule
requires it.

Correct:

```typescript
import * as math from "./math/add.ts";
import type { BuildOptions } from "../config/build.ts";
```

Incorrect:

```typescript
import * as math from "./math/add"; // missing extension
import * as loggers from "./loggers"; // directory import
```

**Why:** explicit paths resolve the same way in Deno, Node, Bun and bundlers.

---

## Avoid Re-exports

Scope: `mod.ts` files and any module that re-exports

Rule: No `export *`. Consumers import from the specific module they need. When a
package needs a curated entry point, re-export named symbols explicitly.

Correct:

```typescript
// mod.ts: curated public API
export { getCommits, getTaggedVersions } from "./git.ts";
export { discoverPackages } from "./workspace-discovery.ts";
```

Incorrect:

```typescript
export * from "./git.ts";
export * from "./versions.ts"; // TS2308 when both export `main`
```

**Why:** wildcard re-exports collide on shared names, hide the public surface
and defeat tree-shaking.
