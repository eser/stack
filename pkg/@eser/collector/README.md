# ⚙️ [@eser/collector](./)

Module export collector and manifest generator. Walks a directory tree,
dynamically imports modules, collects their exports, and generates a typed
manifest file — useful for auto-discovery of routes, handlers, plugins, or any
convention-based module system.

## 🚀 Quick Start

```typescript
import * as collector from "@eser/collector";

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
import * as collector from "@eser/collector";

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

Async generator that yields relative file paths matching the criteria.

```typescript
import * as collector from "@eser/collector";

for await (const file of collector.walkFiles("./src", "**/*.ts", /test/)) {
  console.log(file);
}
```

### `buildManifestFile(filepath, options)`

Collect exports and write a manifest file to disk.

```typescript
import * as collector from "@eser/collector";

await collector.buildManifestFile("./src/manifest.gen.ts", {
  baseDir: "./src/routes",
});
// Generates a file with import statements and a typed manifest object
```

### `buildManifest(target, options)`

Collect exports and write a manifest to a `WritableStream`.

```typescript
import * as collector from "@eser/collector";

const file = await Deno.open("manifest.gen.ts", { write: true, create: true });
await collector.buildManifest(file.writable, {
  baseDir: "./src/routes",
});
```

### `writeManifestToString(collection)`

Convert a collected export array into a formatted manifest string.

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
