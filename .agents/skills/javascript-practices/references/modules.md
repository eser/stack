# Modules and Imports

How TypeScript modules export, import and name their paths.

## Contents

- Exports
- Imports
- Import Paths
- Avoid Re-exports

---

## Exports

Scope: All TypeScript modules

Rule: Export with the `export` keyword on the declaration. No default exports,
except where a framework requires one (frontend-practices: Named Exports for
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
`validate-code-conventions` validator enforces it on new code where it runs.
Name the alias after the module: `path`, `fs`, `semver` for the standard
library, the package's short name (`shell`, `primitives`, `functions`,
`standards`) for workspace packages. When a package's `mod.ts` exposes
sub-modules as namespaces, import the package once and reach sub-modules with
dot notation.

Code and tests may instead import a sub-path that the package publishes in the
`exports` of its `package.json`, still as a namespace. Name the alias after the
sub-module (`span`, `results`, `task`), with the package's short name in front
when the bare name is ambiguous (`shellExec`). Never import a path the package
does not publish, such as a file inside it. A package imports its own modules by
relative path, never through its own name; `validate-self-imports` reports that.
A CLI-first package maps `.` to its CLI and publishes its library as `./mod`
(documentation-conventions: README Import Pattern), so its library is imported
from `/mod`. README examples keep the package root form.

The only exceptions to the namespace form:

- `import { runtime } from "@eserstack/standards/cross-runtime";`
- type-only imports (`import type { BuildOptions } from "./build.ts";`), which
  the `verbatim-module-syntax` lint rule requires for types (Import Paths)
- the default import of a JSON module
  (`import pkg from "./package.json" with { type: "json" };`), whose only export
  is `default`
- the default import of a CSS module, which laroux-bundler compiles to a JSON
  module (frontend-practices: CSS Modules with @apply)

Existing named imports in the code are not a precedent for new ones.

Correct:

```typescript
import * as path from "@std/path";
import * as primitives from "@eserstack/primitives";
import * as shell from "@eserstack/shell";
import * as span from "@eserstack/streams/span"; // published sub-path
import * as workflows from "@eserstack/workflows/mod"; // "." is the CLI
import { runtime } from "@eserstack/standards/cross-runtime";

const filePath = path.join(dir, "config.ts");
const source = await runtime.fs.readTextFile(filePath);
const branch = await shell.exec.exec`git branch --show-current`.text();
const result = primitives.results.ok(source);
const label = span.bold(branch);
const registry = workflows.createRegistry();
```

Incorrect:

```typescript
import { join } from "@std/path"; // named import from a package
import * as span from "@eserstack/streams/span.ts"; // a file, not an export
// inside @eserstack/workflows: its own name instead of "./loader.ts"
import * as loader from "@eserstack/workflows/loader";

const filePath = join(dir, "config.ts"); // which join?
```

**Why:** a namespace shows where every symbol comes from and cannot collide with
a local name. The root form keeps one import per dependency. A sub-path loads
only that module and its imports, while the root loads every module it
re-exports, so the sub-path keeps the module graph small. JSR and npm resolve
only the paths in `exports`, and JSR cannot resolve a package's own name while
that version is being published.

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
