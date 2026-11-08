# @eserstack/collector: FFI Wiring Contract

Verified: 2026-11-09 (TASK-267)

This page is for people who change `@eserstack/collector` or the collector
names of the bridge. It lists where each export runs and which TypeScript
paths are kept as fallbacks, then the wire contract of the names that
`pkg/@eserstack/ajan/bridge_collector.go` registers.

## Audit (TASK-267)

Go means the export already called the bridge before TASK-267, moved means
TASK-267 moved its logic to Go (`pkg/ajan/collectorfx`), and TS means it stays
in TypeScript, for the reason given.

| Export                  | Where | Reason or Go entry                                                                                                                     |
| ----------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `walkFiles`             | Go    | `collectorWalkFiles` (`WalkCollectableFiles`), with the TypeScript walk as a kept fallback (below)                                     |
| `collectExports`        | TS    | Thin adapter: walks with `walkFiles`, then imports each module with the runtime's `import()`, which only the JavaScript host can do    |
| `CollectExportsOptions` | TS    | Type                                                                                                                                   |
| `ExportItem`            | TS    | Type                                                                                                                                   |
| `writeManifestToString` | moved | `collectorGenerateManifest` (`GenerateManifestSource`); the TypeScript part reads the name of each export's value, which Go cannot see |
| `specifierToIdentifier` | moved | `collectorSpecifierToIdentifier` (`SpecifierToIdentifier`), synchronously through `requireLibSync()`                                   |
| `buildManifest`         | TS    | Thin adapter: `collectExports` and `writeManifestToString`, then writes the source to the `WritableStream` it is given                 |
| `buildManifestFile`     | TS    | Thin adapter: `collectExports` and `writeManifestToString`, then writes the source with `runtime.fs.writeTextFile`                     |

`mod.ts` is the only entry point. `walk-fs.ts` (`walkCollectableFiles`,
`UnreadableWalkRootError`) is internal; `walkFiles` throws its
`UnreadableWalkRootError` for a base directory that cannot be read when the
TypeScript walk runs.

Deleted in TASK-267: the TypeScript manifest writer and identifier function
in `manifest.ts` (`toImportSpecifier`, the `Intl.Collator` sort, the
placeholder serializer) and `validator-identifier/`, the TypeScript port of
Babel's identifier checks, which only `specifierToIdentifier` used.

### Kept fallbacks

| Path                                                  | Why it stays                                                                                                                                                                                                                                                   |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `walk-fs.ts` (`walkCollectableFiles`)                 | laroux walks source trees without the native library (TASK-184). `walkFiles` uses it when the bridge does not load (`ESER_AJAN=disabled`, no library) or when the Go walk reports an error (the WASM build outside its preopen, a pattern Go's regexp rejects) |
| The glob filter of `walkFiles` (`simpleGlobToRegExp`) | It filters the answers of both walks. Go has no glob filter (`WalkOptions.GlobFilter` is reserved), and the TypeScript walk needs one without the bridge, so a Go copy would only add a duplicate                                                              |

What laroux reaches: `@eserstack/laroux-bundler` is the only laroux package
that imports `@eserstack/collector`, and it calls only `walkFiles`, always
without a glob filter: `domain/route-scanner.ts:163`,
`domain/build-validator.ts:179` and `:284`, `adapters/react/rsc-analyze.ts:164`,
`adapters/react/rsc-rewrite-imports.ts:613` and
`adapters/tailwindcss/plugin.ts:103`. `@eserstack/laroux-server` reaches those
through the bundler (`commands/build.ts`, `commands/dev.ts`,
`domain/rebuild-handler.ts` and the runtime), and `laroux-bin` is the bin of
laroux-server. No laroux package calls `writeManifestToString`,
`specifierToIdentifier`, `buildManifest`, `buildManifestFile` or
`collectExports`, so manifest generation and identifiers have no kept
fallback.

With `ESER_AJAN=disabled`, `specifierToIdentifier` throws and
`writeManifestToString`, `buildManifest` and `buildManifestFile` reject with
the bridge's load error (`eser-ajan native library unavailable: ...`, with the
load failure as `cause`), while `walkFiles` and `collectExports` keep working
on the TypeScript walk. `bridge.test.ts` and `walk-fs.test.ts` check both in a
child process, and `pkg/@eserstack/laroux-bundler/system.test.ts` builds its
laroux fixtures with `ESER_AJAN=disabled`.

### Fixtures

The fixtures were written from the answers of the TypeScript implementation
before it was deleted:

- `pkg/ajan/collectorfx/testdata/specifier_identifiers.json`: specifiers, in
  sequence over one `used` set, and the identifiers they give
- `pkg/ajan/collectorfx/testdata/manifests.json`: collections (paths and the
  reference names of their exports) and the source they give

Both sides run them: `fixtures_test.go` in Go, and `bridge.test.ts` here,
through `EserAjanCall` directly and through `specifierToIdentifier` and
`writeManifestToString`. `pkg/@eserstack/ajan/wasm/profile-parity.test.ts`
calls the three collector names on the WASM reactor and on the native library
and compares the answers.

## 1. Input marshalling

One request object per call through the ajan dispatcher ABI (TASK-238); the
library encodes it as JSON for `EserAjanCall`. The request and answer types
are in the ajan binding table (`ffi/bindings.ts`).

**Identifier** (`specifierToIdentifier`):

```ts
lib.call("collectorSpecifierToIdentifier", { specifier, used: [...used] });
```

```json
{ "specifier": "routes/[id].ts", "used": ["routes_id_"] }
```

- `specifier`: the path to name
- `used`: the identifiers already taken; the answer is none of them

**Manifest** (`writeManifestToString`):

```ts
lib.call("collectorGenerateManifest", { entries });
```

```json
{ "entries": [{ "relPath": "routes/index.ts", "exports": ["handler"] }] }
```

- `relPath`: the file's path, as `collectExports` returns it
- `exports`: one name per collected export: the name of the export's value,
  `${value.name}`, so a function exported as `default` is referred to by its
  function name and a value without a `name` by `undefined`. This is what the
  TypeScript writer did; the export's own name is not sent.

**Walk** (`walkFiles`):

```ts
lib.call("collectorWalkFiles", { dir, ignoreFilePattern });
```

- `dir`: the base directory
- `ignoreFilePattern`: the `source` of the `RegExp`; its flags are not sent

## 2. Output marshalling

- Identifier: `{ "identifier": "routes_id__1" }`. The field is always present,
  since an empty specifier gives an empty identifier.
- Manifest: `{ "source": "// This file is generated by ..." }`, unformatted
  source that ends in a newline.
- Walk: `{ "files": [{ "relPath": "a/b.ts", "absPath": "/abs/a/b.ts" }] }`,
  depth-first over name-sorted entries; `walkFiles` keeps `relPath`.

## 3. Error protocol

An error answer has an `error` field: `invalid request JSON: ...` for the
identifier and manifest names, and for the walk also
`WalkCollectableFiles: walk root cannot be read: ...` or an invalid ignore
pattern.

`specifierToIdentifier` and `writeManifestToString` throw an `Error` with Go's
message. `walkFiles` does not throw on a Go error: it logs it at debug level
and walks in TypeScript, which throws `UnreadableWalkRootError` for a root it
cannot read.

When the bridge does not load, `specifierToIdentifier` throws the error of
`requireLibSync()` and the manifest functions reject with the error of
`requireLib()`: `eser-ajan native library unavailable: <reason>`, with the load
failure as `cause`.

## 4. Memory ownership

Go allocates each answer with `C.CString`; the ajan library copies it to a JS
string and frees it with `EserAjanFree` itself. TS never sees a C string.

## 5. Sync vs async

`specifierToIdentifier` is synchronous, so it takes the bridge from
`requireLibSync()`, which loads it synchronously on first use. The manifest
functions and `walkFiles` are async and await the bridge's load
(`requireLib()`, `ensureLib()`).

## 6. WASM

`bridge_collector.go` builds with `!wasip1 || eserajan_wasi`, so the three
names are in the wasi profile. `collectorSpecifierToIdentifier` and
`collectorGenerateManifest` read no files (`wasm: "yes"`); they use only
`strings`, `slices`, `strconv`, `sort` and `unicode/utf16`, and the identifier
tables add a few kilobytes. `collectorWalkFiles` needs the working-directory
preopen (`wasm: "fs"`); outside it the Go walk reports an error and
`walkFiles` walks in TypeScript.

## Behavioral divergences

Before TASK-267 the manifest and identifier functions ran in Go only when the
native library had loaded and fell back to TypeScript otherwise, and the two
answered differently. They now always answer what the TypeScript code
answered (the fixtures above):

- `writeManifestToString` (and `buildManifest`, `buildManifestFile`) with the
  native library loaded returned collectorfx's older format: imports without
  the `$$` prefix and unsorted, and a `manifest` of
  `{ path, identifier, exports: ["<export name>"] }` objects ending in
  `as const`. It now returns the format the TypeScript writer and this
  package's README describe: `$$`-prefixed sorted imports and a `manifest`
  whose `exports` array refers to the export values. A project that generated
  its manifest with the native library loaded gets a different file.
- `specifierToIdentifier` used Go only when an earlier call had already loaded
  the library. Go's old rules differed from TypeScript's: it dropped leading
  underscores (`_middleware` gave `middleware`), dropped brackets without a
  separator (`[id]bar` gave `idbar`) and kept non-ASCII letters (`café` gave
  `café`, where TypeScript gives `caf_`). Go now follows the TypeScript rules,
  including that last one: the TypeScript port of Babel's validator checked a
  non-ASCII character after the first only against the continue-only table, so
  letters such as `é` there become `_`. Identifiers stay as the TypeScript
  version made them; making them match Babel would be a separate change.
- The four manifest and identifier exports now need the bridge (native or
  WASM). With neither, they throw where the TypeScript code used to answer.
- Sorting: the TypeScript writer sorted with
  `new Intl.Collator(undefined, { numeric: true })`, in the host's default
  locale. Go sorts ASCII text in the root collation order of that collator
  (whitespace, punctuation and symbols, digits, letters; digit runs by value;
  lower case before upper case; other control characters ignored), checked
  against Node's collator on 40,000 random string pairs. Two cases differ: a
  host locale that tailors ASCII (Danish `aa`, for example) no longer changes
  the order, and non-ASCII characters sort after ASCII by code point instead
  of by the locale's rules.
- Paths: the TypeScript writer used the host's `path.extname` and
  `path.normalize`, the win32 ones on Windows. Go applies the posix rules and
  then turns `\` into `/`. Paths from `walkFiles` use `/` and give the same
  answer; a hand-built collection with `\` in a path can give another
  specifier or identifier on Windows.
