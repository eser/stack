# @eserstack/cs — FFI Wiring Contract

Verified: 2026-04-17 (Wave 2 + Track C)

## 1. Input marshalling

**EserAjanCsGenerate** — generates a Kubernetes ConfigMap or Secret manifest from a `.env` file:
```ts
lib.symbols.EserAjanCsGenerate(JSON.stringify({
  resource: { type: "configmap" | "secret", name: string, namespace?: string },
  envFile: absoluteFilePath,   // ← env NAME resolved to path before sending to Go
  format: "yaml" | "json",
  namespace: string,           // top-level fallback (empty string if undefined)
}));
```
> **Key**: TS receives `env` as a name suffix (e.g. `"test"` → `.env.test`). Go expects an absolute
> file path. TS resolves: `runtime.path.join(runtime.process.cwd(), ".env.${env}")`.
>
> When `env` is `undefined`, the FFI path is skipped entirely — Go cannot auto-discover `.env` from CWD.

**EserAjanCsSync** — generates a `kubectl patch` command to sync env values into an existing resource:
```ts
lib.symbols.EserAjanCsSync(JSON.stringify({
  resource: { type, name, namespace? },
  envFile: absoluteFilePath,
  format: "json" | "yaml",
  stringOnly: boolean,
}));
```

## 2. Output marshalling

Both symbols return `{ result: string } | { error: string }`:
```ts
const parsed = JSON.parse(raw) as { result?: string; error?: string };
if (!parsed.error) return parsed.result ?? "";
// else: fall through to TS fallback
```

`result` for **EserAjanCsGenerate** is the manifest string. For JSON format, Go uses
`WriteStart + WriteItem(IsFirst:true) + WriteEnd` (Track C fix), so the output is a JSON array:
```json
[
{
  "apiVersion": "v1",
  "kind": "ConfigMap",
  ...
}

]
```
This matches `formats.serialize([resource], "json")` on the TS side.

For YAML format, Go's YAML `WriteItem` wraps the resource in `[]any{resource}` and marshals a YAML
sequence:
```yaml
- apiVersion: v1
  kind: ConfigMap
  metadata:
    name: my-config
```

## 3. Error protocol

Always-valid-JSON model: Go never returns null or empty.

```go
type csResultResponse struct {
    Result string `json:"result,omitempty"`
    Error  string `json:"error,omitempty"`
}
```

On Go error: `result` is absent, `error` is set. TS falls through to TS implementation.
No structured error codes from Go — the TS layer uses try/catch fallback.

## 4. Memory ownership

Go allocates return strings with `C.CString` (heap). FFI backends copy to JS string and call
`EserAjanFree` internally. **TS calling code never calls `EserAjanFree` directly.**

## 5. Handle lifecycle

N/A — `@eserstack/cs` is stateless. No handles are created or maintained. Both
`EserAjanCsGenerate` and `EserAjanCsSync` are single-call request/response.

## 6. Known limitations / WASM

- `EserAjanCsGenerate` reads from a `.env` file on disk — WASM's `wasip1` has no `open()`, so FFI
  will fail. TS fallback handles file reading via `@eserstack/config/dotenv`.
- `EserAjanCsSync` runs `kubectl` as a subprocess — subprocess execution is unavailable in WASM.
  TS fallback constructs the patch command string independently.
- When `env: undefined`, TS auto-discovers `.env` from CWD via `dotenv.load({ env: undefined })`.
  This case is always TS-only.

## Behavioral divergences

### D1 — JSON format: single object → array `RESOLVED_IN_GO`

**Discovery (Wave 2)**: Go's original `csfx.Generate` called `f.WriteItem(resource, opts)` without
`WriteStart`/`WriteEnd`. For JSON format, `WriteItem` without `opts.IsFirst=true` prepends `,\n`,
producing `,\n{...}` — not a valid JSON array. TS's `formats.serialize([resource], "json")` produces
`[{...}]`.

**Workaround applied (Wave 2)**: TS `generate.ts` restricted FFI to `format === "yaml"` only, routing
JSON to TS fallback.

**Resolution (Track C 2026-04-17)**: Fixed in `pkg/ajan/csfx/generate.go` — changed to use
`WriteStart + WriteItem(IsFirst:true) + WriteEnd`. All formats now go through FFI uniformly.
Hybrid routing removed from `generate.ts`.

### sync.ts TS fallback format dispatch — NOT a divergence

`sync.ts:307` contains `if (format === "yaml")` inside the TS fallback body. This is format-specific
serialization within the TS fallback implementation, not a routing decision between FFI and TS. It is
not a behavioral divergence — both Go (FFI path) and TS (fallback path) handle all formats correctly.
