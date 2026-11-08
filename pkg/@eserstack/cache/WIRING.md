# @eserstack/cache — FFI Wiring Contract

Verified: 2026-11-08 (TASK-267)

This page is for people who change `@eserstack/cache` or the cache names of the
bridge. It lists where each export runs, then the wire contract of the cache
names that `pkg/@eserstack/ajan/bridge_cache.go` registers.

## Audit (TASK-267)

Go means the export already called the bridge before TASK-267, moved means
TASK-267 moved its logic to Go (`pkg/ajan/cachefx`), and TS means it stays in
TypeScript, for the reason given.

| Export                          | Where | Reason or Go entry                                                              |
| ------------------------------- | ----- | ------------------------------------------------------------------------------- |
| `AppIdentifier`                 | TS    | Type                                                                            |
| `CacheEntry`                    | TS    | Type                                                                            |
| `CacheManager`                  | TS    | Type                                                                            |
| `CacheManagerOptions`           | TS    | Type                                                                            |
| `createCacheManager`            | TS    | Thin adapter: builds the manager object, holds the handle, maps answers         |
| `CacheManager.list`             | Go    | `cacheList`                                                                     |
| `CacheManager.remove`           | Go    | `cacheRemove`; TASK-267 moved the relative path resolution to `Manager.Resolve` |
| `CacheManager.clear`            | Go    | `cacheClear`                                                                    |
| `CacheManager.close`            | Go    | `cacheClose`                                                                    |
| `CacheManager.exists`           | moved | `cacheExists` (`Manager.Exists`)                                                |
| `CacheManager.ensureDir`        | moved | `cacheEnsureDir` (`Manager.EnsureDir`)                                          |
| `CacheManager.getCacheDir`      | moved | `cacheResolvePaths` (`AppDir`), synchronously                                   |
| `CacheManager.getVersionedPath` | moved | `cacheResolvePaths` (`VersionedPath`), synchronously                            |
| `getXdgCacheHome`               | moved | `cacheResolvePaths` (`Host.CacheHome`), synchronously                           |
| `getXdgDataHome`                | moved | `cacheResolvePaths` (`Host.DataHome`), synchronously                            |
| `getXdgConfigHome`              | moved | `cacheResolvePaths` (`Host.ConfigHome`), synchronously                          |
| `getAppCacheDir`                | moved | `cacheResolvePaths` (`AppDir`), synchronously                                   |
| `getVersionedCachePath`         | moved | `cacheResolvePaths` (`VersionedPath`), synchronously                            |

### Kept fallbacks

None. The package has no browser code, and laroux does not import it (no
package in the repository does), so nothing here needs to run without the
bridge. With `ESER_AJAN=disabled`, every Go and moved row throws (the
synchronous ones) or rejects with the bridge's load error (`eser-ajan native
library unavailable: ...`, with the load failure as `cause`); `bridge.test.ts`
checks all twelve in a child process.

### Synchronous exports

The seven `cacheResolvePaths` rows return a `string` synchronously. They reach
the bridge through `requireLibSync()` of `@eserstack/ajan/ffi/client`, which
loads the library with `loadEserAjanSync()` on first use: native first, then
the WASM build, which compiles on the calling thread (the ajan README gives
the timings). Each call sends the host facts (`host.ts`), so both backends
resolve the same directories. An app without a name has no app paths: the
functions throw `app.name is required`, as `cacheCreate` does, where the
TypeScript code before TASK-267 joined the empty name.

### Fixtures

`pkg/ajan/cachefx/testdata/` holds the cases both sides run:
`fixtures_test.go` in Go, and `bridge.test.ts` here through `EserAjanCall`,
both on `cacheResolvePaths` directly with each case's host and on the public
functions in a child process that runs as each case's host for this platform.
`pkg/@eserstack/ajan/wasm/profile-parity.test.ts` calls every cache name on
the WASM reactor and on the native library and compares the answers.

## 1. Input marshalling

Every call goes through the dispatcher ABI of `@eserstack/ajan` (TASK-238):
`lib.call(name, request)` with a request object, which the library encodes as
JSON for `EserAjanCall`. The names and their request and answer types are in
the ajan binding table (`ffi/bindings.ts`).

**Host facts.** `cacheCreate` and `cacheResolvePaths` take an optional `host`:

```json
{
  "platform": "linux",
  "home": "/home/user",
  "env": { "XDG_CACHE_HOME": "/xdg/cache" }
}
```

`platform` is a Go OS name (`darwin`, `windows`, `linux`, ...). A field that is
absent falls back to the Go process's own value; an `env` object replaces the
process environment as a whole. The WASM build runs as wasip1 without the
host's home directory or environment, so `cache.ts` always sends them
(`host.ts` reads them).

**Create** (handle-based; must be called before the handle calls):

```ts
lib.call("cacheCreate", {
  app: { name: app.name, org: app.org },
  baseDir,
  host: host.currentHost(),
});
```

`baseDir` is optional. When it is absent, Go uses the cache home of `host`.

> **Footgun**: Sending `{ name, org, baseDir }` flat (without the nested `app`
> key) makes the bridge answer `app.name is required`. Always nest as
> `{ app: { name, org }, baseDir }`.

**Resolve paths** (stateless, reads no files):

```ts
lib.call("cacheResolvePaths", { host, app, baseDir, version, item });
// { cacheHome, dataHome, configHome, appDir?, versionedPath? }
```

`appDir` and `versionedPath` are present when `app.name` is set.

**Exists / EnsureDir / Remove** (handle + path):

```ts
lib.call("cacheExists", { handle, path }); // { exists }
lib.call("cacheEnsureDir", { handle, path }); // {}
lib.call("cacheRemove", { handle, path }); // {}
```

A relative `path` is resolved against the cache directory in Go
(`Manager.Resolve`); an absolute one is used as it is.

**List / Clear / Close** (handle-only):

```ts
lib.call("cacheList", { handle });
lib.call("cacheClear", { handle });
lib.call("cacheClose", { handle });
```

`cacheGetDir` and `cacheGetVersionedPath` answer the directory and a versioned
path of a handle; the TypeScript package does not call them.

## 2. Output marshalling

`lib.call` answers the parsed JSON, error answers included.

**List** response:

```ts
const result = lib.call("cacheList", { handle }) as {
  entries?: Array<{
    path: string;
    name: string;
    isDirectory: boolean;
    size: number;
    mtimeUnix: number; // Unix seconds (int64), NOT an ISO string
  }>;
  error?: string;
};
// Always guard: (result.entries ?? []).map(...)
```

> **Footgun**: `entries` is tagged `omitempty` in Go. When the cache dir is
> empty, the field is **absent** from the JSON response (`{}`), not
> `{ "entries": [] }`. Guard with `(result.entries ?? []).map(...)`.

**mtimeUnix conversion**:

```ts
mtime: e.mtimeUnix ? new Date(e.mtimeUnix * 1000) : null;
```

Go sends Unix seconds as `int64`; multiply by 1000 to get milliseconds for
`new Date()`.

**Exists** answers `{ "exists": true }` or `{ "exists": false }`; a path that
cannot be stat'ed, for lack of permission for one, counts as missing, as
`runtime.fs.exists` did.

The `cacheClose` answer is ignored entirely (fire-and-forget).

## 3. Error protocol

Always-valid-JSON model: Go never returns null or empty. On error, the answer
has an `error` field and no other field. `cache.ts` throws an `Error` with that
message. No structured error codes come from Go.

When the bridge does not load, `ffiClient.requireLib()` throws
`eser-ajan native library unavailable: <reason>` with the load failure as
`cause`, and every Go-backed method rejects with it.

## 4. Memory ownership

Go allocates every answer with `C.CString` (heap). The ajan library copies it
to a JS string and frees it with `EserAjanFree` itself; TS calling code never
sees a C string.

Handles (`"cache-1"`, etc.) are opaque Go-side strings: do not parse,
construct, or persist them.

## 5. Handle lifecycle

`_handlePromise` is a lazy singleton per `createCacheManager()` instance:

- **Create**: triggered on the first async operation (`exists`, `ensureDir`,
  `list`, `remove`, `clear`), which calls `cacheCreate`
- **Close**: `close()` resets `_handlePromise = null` BEFORE calling Go, so a
  concurrent second close sees null and returns early. This is intentional: it
  prevents double-free.

Supports `await using cache = ...` (TC39 explicit resource management) via
`[Symbol.asyncDispose]: close`.

**Gate results (2026-04-17)**:

- G11 create+close: PASS (test "close() releases handle without error")
- G12 1000-loop: PASS (1000/1000 cycles, no errors or leaks)
- G13 double-close: PASS (test "double-close is safe")

## 6. WASM

- Every cache name is in the wasi profile (`bridge_cache.go` builds with
  `!wasip1 || eserajan_wasi`). `cacheResolvePaths` reads no files
  (`wasm: "yes"`); the others need the loader's preopen of the working
  directory (`wasm: "fs"`), so on WASM they reach only paths under it.
- Without `host`, the WASM build resolves the cache home as GOOS wasip1 with no
  home directory, which gives the relative `.cache`. `cache.ts` always sends
  `host`.
- `list()` only returns immediate children of the cache dir (non-recursive).

## Behavioral divergences

Before TASK-267, Go's `XdgCacheHome`, `XdgDataHome` and `XdgConfigHome` read
the `XDG_*` variables on every system, while TypeScript and Go's own doc
comments read them on Linux and BSD only. With `XDG_CACHE_HOME` set on macOS,
`list()` (Go) and `getCacheDir()` (TypeScript) named different directories.
cachefx now follows the documented rules, which `xdg_homes.json` pins.
