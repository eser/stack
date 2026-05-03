# @eserstack/cache — FFI Wiring Contract

Verified: 2026-04-17 (Wave 2)

## 1. Input marshalling

All calls use `JSON.stringify` into a single `*C.char` argument.

**Create** (handle-based — must be called before list/remove/clear/close):
```ts
lib.symbols.EserAjanCacheCreate(
  JSON.stringify({ app: { name: app.name, org: app.org }, baseDir }),
);
```
Wire type:
```json
{ "app": { "name": "my-cli", "org": "eser" }, "baseDir": "/optional/override" }
```
`baseDir` is optional. When absent, Go resolves the XDG cache dir.

> **Footgun**: Sending `{ name, org, baseDir }` flat (without the nested `app` key) causes the bridge
> to receive `app.Name=""` and return a null handle silently. Always nest as `{ app: { name, org }, baseDir }`.

**List / Clear / Close** (handle-only):
```ts
lib.symbols.EserAjanCacheList(JSON.stringify({ handle }));
lib.symbols.EserAjanCacheClear(JSON.stringify({ handle }));
lib.symbols.EserAjanCacheClose(JSON.stringify({ handle }));
```

**Remove** (handle + absolute path):
```ts
lib.symbols.EserAjanCacheRemove(
  JSON.stringify({ handle, path: resolvePath(relativePath) }),
);
```
> **Footgun**: Go's `os.RemoveAll(path)` is path-literal — it does NOT prepend the cache directory.
> Always pass an absolute path. Use `resolvePath()` before sending to Go.

## 2. Output marshalling

**Create** response:
```ts
const result = JSON.parse(raw) as { handle: string; error?: string };
// result.handle → "cache-1" (opaque string)
```

**List** response:
```ts
const result = JSON.parse(raw) as {
  entries?: Array<{
    path: string;
    name: string;
    isDirectory: boolean;
    size: number;
    mtimeUnix: number;  // Unix seconds (int64), NOT an ISO string
  }>;
  error?: string;
};
// Always guard: (result.entries ?? []).map(...)
```
> **Footgun**: `entries` is tagged `omitempty` in Go. When the cache dir is empty, the field is
> **absent** from the JSON response (`{}`), not `{ "entries": [] }`. `result.entries.map(...)` throws
> TypeError on undefined. Guard with `(result.entries ?? []).map(...)`.

**mtimeUnix conversion**:
```ts
mtime: e.mtimeUnix ? new Date(e.mtimeUnix * 1000) : null
```
Go sends Unix seconds as `int64`; multiply by 1000 to get milliseconds for `new Date()`.

**Remove / Clear / Close** response:
```ts
const result = JSON.parse(raw) as { error?: string };
if (!result.error) return;  // success
```
`EserAjanCacheClose` return value is ignored entirely (fire-and-forget).

## 3. Error protocol

Always-valid-JSON model: Go never returns null or empty.

```go
type cacheCreateResponse struct {
    Handle string `json:"handle,omitempty"`
    Error  string `json:"error,omitempty"`
}
```

On error, `handle` is absent and `error` is set. TS falls through to the TS filesystem implementation.
No structured error codes from Go — the TS layer uses try/catch fallback, not code mapping.

## 4. Memory ownership

Go allocates all return strings with `C.CString` (heap). FFI backends copy to JS string and call
`EserAjanFree` internally. **TS calling code never calls `EserAjanFree` directly.**

Handles (`"cache-1"`, etc.) are opaque Go-side strings — do not parse, construct, or persist them.

## 5. Handle lifecycle

`_handlePromise` is a lazy singleton per `createCacheManager()` instance:

```ts
let _handlePromise: Promise<string | null> | null = null;
```

- **Create**: triggered on first async operation (`list`, `remove`, `clear`) — calls `EserAjanCacheCreate`
- **Close**: `close()` resets `_handlePromise = null` BEFORE awaiting, so a concurrent second close sees
  null and returns early. This is intentional — it prevents double-free.

```ts
const close = async (): Promise<void> => {
  if (_handlePromise === null) return;       // idempotent guard
  const handle = await _handlePromise;
  _handlePromise = null;                     // reset before Go call
  if (handle !== null) {
    lib.symbols.EserAjanCacheClose(JSON.stringify({ handle }));
  }
};
```

Supports `await using cache = ...` (TC39 explicit resource management) via `[Symbol.asyncDispose]: close`.

**Gate results (2026-04-17)**:
- G11 create+close: PASS (test "close() releases handle without error")
- G12 1000-loop: PASS (1000/1000 cycles, no errors or leaks)
- G13 double-close: PASS (test "double-close is safe")

## 6. Known limitations / WASM

- `EserAjanCacheCreate` uses XDG dir resolution which calls `os.UserCacheDir()` — this returns an
  error under WASM (`wasip1`). Cache FFI will fail silently under WASM; TS fallback handles all ops.
- File mtime is returned as `mtimeUnix: int64` (Unix seconds). Zero means "stat failed" — TS maps
  to `null`, not `new Date(0)`.
- `list()` only returns immediate children of the cache dir (non-recursive) — matches `readDir` behavior.

## Behavioral divergences

None discovered — cache package had no pre-existing TS implementation, so no TS-vs-Go test divergences.
The TS implementation in `cache.ts` was written fresh to match Go's wire protocol.
