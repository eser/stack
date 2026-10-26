# ⚙️ [@eserstack/collector](./)

> **Note:** JSR is frozen at 4.5.x. From 5.0.0, `@eserstack/collector` is
> published on npm under the same name (`pnpm add @eserstack/collector`); the
> JSR versions stay available but get no updates.

> **eserstack Library** — [eser/stack on GitHub](https://github.com/eser/stack)
> **Install:** `pnpm add jsr:@eserstack/collector`

Module export collector and manifest generator. Walks a directory tree,
dynamically imports modules, collects their exports, and generates a typed
manifest file — useful for auto-discovery of routes, handlers, plugins, or any
convention-based module system.

## 🚀 Quick Start

```typescript
import * as collector from "@eserstack/collector";

// Collect all exports from a directory
const exports = await collector.collectExports({
  baseDir: "./src/routes",
});

for (const [file, moduleExports] of exports) {
  console.log(`${file}: ${moduleExports.map(([name]) => name).join(", ")}`);
}
```

## 🛠 Features

- **File Walking** — Recursively walk directories for JS/TS modules
- **Export Collection** — Dynamically import and collect module exports
- **Manifest Generation** — Generate typed manifest files with import statements
- **Glob Filtering** — Filter files with glob patterns
- **Export Filtering** — Custom filter functions for selective export collection
- **Test File Exclusion** — Automatically skips test files by default

## 🔌 API Reference

### `collectExports(options)`

Walk a directory tree, import each module, and return its exports.

```typescript
import * as collector from "@eserstack/collector";

const exports = await collector.collectExports({
  baseDir: "./src/handlers",
  globFilter: "**/mod.ts",
  exportFilter: async (entries) =>
    entries.filter(([name]) => name.startsWith("handle")),
});
// Returns: Array<[filename, Array<[exportName, exportValue]>]>
```

| Option              | Type                                                             | Description                                     |
| ------------------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| `baseDir`           | `string`                                                         | Root directory to walk                          |
| `globFilter`        | `string`                                                         | Glob pattern to filter files                    |
| `exportFilter`      | `(entries: [string, unknown][]) => Promise<[string, unknown][]>` | Filter collected exports                        |
| `ignoreFilePattern` | `RegExp`                                                         | Pattern for files to skip (default: test files) |

### `walkFiles(baseDir, globFilter, ignoreFilePattern)`

Async generator that yields relative file paths matching the criteria. It walks
`.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs` and `.cjs` files, skips
`node_modules`, `.git`, `dist`, `coverage`, `.output` and `.cache` directories
and unreadable directories below `baseDir`, and yields files in depth-first,
name-sorted order. A `baseDir` that cannot be read is an error.

The walk runs in Go when the native ajan library is loaded. Without it (no
library, `ESER_AJAN=disabled`, or only the WASM build, which has no filesystem)
the same walk runs in TypeScript on the runtime's file system, so no native
library is required.

```typescript
import * as collector from "@eserstack/collector";

for await (const file of collector.walkFiles("./src", "**/*.ts", /test/)) {
  console.log(file);
}
```

### `buildManifestFile(filepath, options)`

Collect exports and write a manifest file to disk.

```typescript
import * as collector from "@eserstack/collector";

await collector.buildManifestFile("./src/manifest.gen.ts", {
  baseDir: "./src/routes",
});
// Generates a file with import statements and a typed manifest object
```

### `buildManifest(target, options)`

Collect exports and write a manifest to a `WritableStream`.

```typescript
import * as fs from "node:fs";
import * as stream from "node:stream";
import * as collector from "@eserstack/collector";

const file = stream.Writable.toWeb(fs.createWriteStream("manifest.gen.ts"));
await collector.buildManifest(file, {
  baseDir: "./src/routes",
});
```

### `writeManifestToString(collection)`

Convert a collected export array into a manifest string. The source is not
formatted; run it through a formatter such as oxfmt for canonical style.

### `specifierToIdentifier(specifier, used)`

Convert a file path into a valid JavaScript identifier for use in generated
imports.

## 📋 Types

### `ExportItem`

```typescript
type ExportItem = [string, Array<[string, unknown]>];
// [filename, Array<[exportName, exportValue]>]
```

### `CollectExportsOptions`

```typescript
type CollectExportsOptions = {
  baseDir: string;
  globFilter?: string;
  exportFilter?: (entries: [string, unknown][]) => Promise<[string, unknown][]>;
  ignoreFilePattern?: RegExp;
};
```

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
