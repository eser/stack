# @eserstack/config — FFI Wiring Contract

## 1. Input marshalling

TS arguments are serialized to a single JSON string passed as `*C.char`:

```ts
// TS call site
lib.symbols.EserAjanConfigLoad(
  JSON.stringify({ sources, caseInsensitive: opts?.caseInsensitive ?? false }),
);
```

Go `configLoadRequest`:
```json
{ "sources": ["system_env", "env_file:.env"], "caseInsensitive": true }
```

Valid source specifiers:
- `"system_env"` — all OS environment variables
- `"env_file"` — `.env` (auto-resolved by `APP_ENV`)
- `"env_file:<filename>"` — named dotenv file
- `"json_file"` — `config.json` (auto-resolved by `APP_ENV`)
- `"json_file:<filename>"` — named JSON config file
- `"json_string:<json>"` — inline JSON string

## 2. Output marshalling

Go returns a JSON string (`*C.char`). Backends copy it to a JS `string` before returning. TS parses with `JSON.parse`:

```ts
const raw: string = lib.symbols.EserAjanConfigLoad(reqJson);
const result = JSON.parse(raw) as { values?: Record<string, unknown>; error?: string };
```

Success payload: `{ "values": { "KEY": "value", ... } }`
Error payload:   `{ "error": "<message>" }`

Values are always `Record<string, unknown>` — flat, case-sensitive by default.

## 3. Error protocol

Always-valid-JSON model: Go never returns null or empty. The `error` field is present and non-empty on failure.

```go
type configLoadResponse struct {
    Values map[string]any `json:"values"`
    Error  string         `json:"error,omitempty"`
}
```

No structured error codes from Go. TS maps substrings to codes:
- `"failed to parse env file"` → `CONFIG_PARSE_ENV_FILE_FAILED`
- `"failed to parse JSON file"` → `CONFIG_PARSE_JSON_FILE_FAILED`
- `"failed to parse JSON string"` → `CONFIG_PARSE_JSON_STRING_FAILED`
- anything else → `CONFIG_LOAD_FAILED`

## 4. Memory ownership

Go allocates the return string with `C.CString` (heap). FFI backends (Deno/Bun/Node) copy the C string to a JS string and then call `EserAjanFree` internally. **TS calling code never calls `EserAjanFree` directly.** The `FFILibrary` wrapper handles this.

Call sequence:
1. TS: `lib.symbols.EserAjanConfigLoad(json)` → backend calls C func, copies result to JS string, calls `EserAjanFree` on C ptr
2. TS: receives plain JS `string`, no manual cleanup needed
3. WASM mode: identical contract; WASM memory is managed by the instance

## 5. Sync vs async

Public API is `Promise<ConfigValues>` even though the native FFI call is synchronous.

```ts
export const ffiLoader: Loader = {
  async load(sources, opts): Promise<ConfigValues> { ... }
};
```

Rationale: `loadEserAjan()` itself is async (library resolution, WASM fetch), and the lazy singleton setup requires `await ensureLib()`. Keeping the public surface uniformly `Promise`-returning avoids a breaking change when streaming/batch calls are added for other packages.

## 6. Error translation

Go `error` strings → typed `ConfigError`:

```ts
export class ConfigError extends Error {
  constructor(message: string, public readonly code: string, cause?: unknown) {
    super(message);
    this.name = "ConfigError";
  }
}

// sentinel strings mirror Go's error var names
export const CONFIG_LOAD_FAILED              = "CONFIG_LOAD_FAILED";
export const CONFIG_PARSE_ENV_FILE_FAILED    = "CONFIG_PARSE_ENV_FILE_FAILED";
export const CONFIG_PARSE_JSON_FILE_FAILED   = "CONFIG_PARSE_JSON_FILE_FAILED";
export const CONFIG_PARSE_JSON_STRING_FAILED = "CONFIG_PARSE_JSON_STRING_FAILED";
```

Usage:
```ts
if (result.error) {
  throw new ConfigError(result.error, mapErrorCode(result.error));
}
```

## Architectural note: two-layer split

`@eserstack/config` has two orthogonal concerns:
1. **OpenFeature-style metadata registry** (`Config` class, `Source`, `Provider`) — TS-only, no Go analog. Not replaced by FFI.
2. **Config value loading** (env, JSON) — maps to Go `configfx`. Replaced by FFI via `adapters/ffi/`.

The `./file` subpath (YAML/TOML/JSONC typed parsing) and `./dotenv` subpath (env utilities) have no complete Go analog and remain as TS in this pilot.

## Runtime quirks (verified 2026-04-16)

**Binaries rebuilt and verified.** `dist/aarch64-darwin/libeser_ajan.dylib` rebuilt Apr 16 23:31 (32.5 MB, 62 EserAjan symbols). `dist/wasi/eser-ajan.wasm` rebuilt Apr 16 23:32 (61 MB). Legacy `libeser_go.dylib` deleted — it was a stale artifact; the resolver never referenced it.

**Native FFI works.** Round-trip smoke: `load(["json_file:<path>"])` returns expected values via native dylib on aarch64-darwin. Confirmed with `deno test --allow-all`.

**All config values are strings.** Go `configfx.LoadMap` coerces all JSON values to strings. A JSON file `{"NUM": 42}` produces `{ "NUM": "42" }` on the wire. Callers must not expect typed values — `ConfigValues` is `Record<string, unknown>` but every leaf will be a string in practice.

**WASM mode: no filesystem access.** `wasip1` does not implement `open()` — `json_file:` and `env_file:` sources fail with `Not implemented on wasip1`. Only `system_env` and `json_string:` sources work in WASM mode. This is a fundamental WASI limitation, not a bug.

**FFI lazy singleton requires `sanitizeResources: false`.** The `_lib` singleton persists across the test process lifetime. Deno's resource-leak sanitizer will flag any test that causes `Deno.dlopen` to be called. Suppress with `Deno.test({ sanitizeResources: false }, ...)` on any test exercising the FFI path.

**WASM fallback mechanism.** Force WASM by setting `ESER_AJAN_NATIVE=disabled`. Force native-only (no WASM fallback) with `ESER_AJAN_WASM=disabled`. Both env vars are read by `ffi/mod.ts`.

## Behavioral divergences

### configfx.reflectSetField — float32 panic

- **Status**: RESOLVED
- **Location**: `pkg/ajan/configfx/manager.go` function `reflectSetField`, the `reflect.TypeFor[float32]()` case
- **Fix**: Added `float32(floatValue)` cast on `manager.go` line 475 — `finalValue = reflect.ValueOf(float32(floatValue))`. One-line change.
- **Tests**: `pkg/ajan/configfx/configfx_float_test.go` — four tests covering valid float32, negative/zero, malformed input (silent zero), and overflow (+Inf).
- **Discovered**: 2026-04-17 during Phase F-prereq coverage push. Silent fix applied and reverted per Rule 2. Applied as approved separate task.
- **Root cause**: `strconv.ParseFloat(v, 32)` returns `float64` by design (bitSize controls precision, not return type); `reflect.Value.Set` requires exact type identity, so `float64 → float32` field assignment panicked.
