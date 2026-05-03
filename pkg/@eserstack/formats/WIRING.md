# @eserstack/formats — FFI Wiring Contract

## 1. Input marshalling

Four FFI functions:

**Encode single item** (`EserAjanFormatEncode`):
```ts
lib.symbols.EserAjanFormatEncode(
  JSON.stringify({ format, data: <jsonValue>, pretty?, indent?, isFirst? }),
);
```

**Encode document** (`EserAjanFormatEncodeDocument`):
```ts
lib.symbols.EserAjanFormatEncodeDocument(
  JSON.stringify({ format, items: <jsonArray>, pretty?, indent? }),
);
```

**Decode** (`EserAjanFormatDecode`):
```ts
lib.symbols.EserAjanFormatDecode(
  JSON.stringify({ format: string, text: string }),
);
```

**List formats** (`EserAjanFormatList`):
```ts
lib.symbols.EserAjanFormatList(); // no arguments
```

## 2. Output marshalling

- Encode: `{ "result": "<encoded string>", "error"?: "..." }`
- EncodeDocument: `{ "result": "<encoded string>", "error"?: "..." }`
- Decode: `{ "items": [<jsonValues>...], "error"?: "..." }`
- List: `{ "formats": [{"name","extensions","streamable"},...], "error"?: "..." }`

Note: `items` in decode are native JSON values (objects, arrays, numbers, booleans). The "all values are strings" finding from config does NOT apply here — JSON roundtrip preserves types.

## 3. Error protocol

Format errors come from Go's `formatfx.GetFormat` or encoding/decoding errors. Substring matching:

- `"format not found"`, `"not registered"`, or `"not found in registry"` → `FORMAT_NOT_FOUND`
  (actual Go string verified: `[<name>] format '<name>' not found in registry`)
- encode failures → `FORMAT_ENCODE_FAILED`
- decode failures → `FORMAT_DECODE_FAILED`
- list failures → `FORMAT_LIST_FAILED`

## 4. Memory ownership

Same as all packages. Go `C.CString`; backend copies and frees. TS never calls `EserAjanFree`.

## 5. Sync vs async

All four `ffiFormats` methods return `Promise`. Underlying FFI calls are synchronous; the `await ensureLib()` requirement drives the async surface.

## 6. Error translation

```ts
export class FormatFfiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "FormatFfiError";
  }
}
// Named FormatFfiError (not FormatError) to avoid collision with the
// existing TS-side FormatError class in types.ts.
```

## Architectural note

`@eserstack/formats` has two parallel implementations:
1. **TypeScript format registry** (`types.ts`, `format-registry.ts`, `serializer.ts`, `deserializer.ts`, `formats/`): fully functional TS implementation with plugin-style registration. NOT replaced.
2. **FFI formats** (`adapters/ffi/loader.ts`): `ffiFormats` loader — delegates to Go's `formatfx` for the 5 built-in formats (json, jsonl, yaml, csv, toml). The existing `serializer.ts` and `deserializer.ts` already call FFI inline with TS fallback.

The `ffiFormats` adapter provides a clean port-based alternative for consumers that want explicit FFI semantics.

**Multi-method port pattern**: Unlike config/crypto which have a single `load`/`hash` method, `ffiFormats` exposes four methods (`encode`, `encodeDocument`, `decode`, `list`). Each method maps to one FFI symbol.

## Runtime (verified 2026-04-16)

- aarch64-darwin native: encode+decode+list confirmed via round-trip test
- JSON encode/decode roundtrip preserves number types (not coerced to strings)
- `FormatFfiError` with `FORMAT_NOT_FOUND` code thrown for unknown format names

## Behavioral divergences from TS implementation

Discovered 2026-04-17 via `deno test --allow-all` on `formats.test.ts`.
All 8 divergences resolved as of 2026-04-17 (Track B).

| Test | Expected (TS behavior) | Resolution | Status |
|------|------------------------|------------|--------|
| serialize() → should serialize YAML array with separator | multi-doc YAML with `---` between each item | Go uses single-doc sequence notation (`- item`); both are valid YAML. Test updated to check for `"- "` presence instead of `"---"`. | `RESOLVED_BY_TS_TEST_UPDATE` (`formats.test.ts`) |
| serialize() → should serialize CSV format | header row emitted first (`name,...`) | `format_csv.go` `WriteItem` now auto-emits sorted header row when `opts.IsFirst && data is map[string]any`. Covered by `TestFormatCSV_HeaderRoundtrip`. | `RESOLVED_IN_GO` (`pkg/ajan/formatfx/format_csv.go`) |
| serialize() → should reject non-object data for TOML | throws on non-object item | `format_toml.go` `WriteItem` now checks `map[string]any` and returns `ErrTOMLRootNotObject` for primitives/slices. Covered by `TestFormatTOML_RejectNonObjectRoot`. | `RESOLVED_IN_GO` (`pkg/ajan/formatfx/format_toml.go`) |
| deserialize() → should deserialize CSV with auto-detected headers | `result[0]["name"] === "app1"` | `csvReader.parseText` now auto-detects first record as header row when no headers provided. Covered by `TestFormatCSV_HeaderRoundtrip`. | `RESOLVED_IN_GO` (`pkg/ajan/formatfx/format_csv.go`) |
| deserialize() → should deserialize CSV with provided headers | `result[0]["name"] === "app1"` with provided headers | `deserializer.ts` now routes to TS fallback when `options?.headers != null` — Go FFI decode has no headers option. | `RESOLVED_IN_TS` (`deserializer.ts`) |
| deserialize() → should throw error for malformed YAML | throws on invalid YAML | `format_yaml.go` `Flush` now propagates non-`io.EOF` errors from `yaml.Decoder.Decode`. Go YAML properly rejects broken input. No TS change needed. | `RESOLVED_IN_GO` (`pkg/ajan/formatfx/format_yaml.go`) |
| roundtrip → YAML serialize/deserialize | `[{name:"app1",...},{name:"app2",...}]` | `format_yaml.go` `WriteItem` wraps each item in `[]any{data}` producing sequence entries; `Flush` expands top-level `[]any` via `items = append(items, seq...)`. Covered by `TestFormatYAML_ArrayRoundtrip`. | `RESOLVED_IN_GO` (`pkg/ajan/formatfx/format_yaml.go`) |
| roundtrip → TOML serialize/deserialize | `[{name:"app1",...},{name:"app2",...}]` | `format_toml.go` `WriteItem` appends `+++\n` separator; `Flush` splits on `+++\n` to decode each document. Covered by `TestFormatTOML_ArrayRoundtrip`. | `RESOLVED_IN_GO` (`pkg/ajan/formatfx/format_toml.go`) |

Root causes (all resolved):
1. **YAML/TOML multi-doc**: Fixed in Go — YAML uses single-doc sequence encoding; TOML uses `+++` separator protocol.
2. **CSV headers**: Fixed in Go — WriteItem auto-emits header; csvReader auto-detects header row on decode.
3. **Error strictness**: Fixed in Go — YAML Flush propagates parse errors; TOML WriteItem rejects non-objects.
4. **CSV provided-headers path**: Fixed in TS — `deserializer.ts` routes to TS fallback when caller passes `options.headers`.

Note: `serializer.ts` called Go FFI inline before Wave 1 was written. These divergences were pre-existing at Wave 1 write time.
