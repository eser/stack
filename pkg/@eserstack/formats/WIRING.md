# @eserstack/formats: FFI Wiring Contract

Verified: 2026-11-09 (TASK-267)

This page is for people who change `@eserstack/formats` or the format names of
the bridge. It lists where each export runs and which TypeScript paths are kept
as fallbacks, then the wire contract of the names that
`pkg/@eserstack/ajan/bridge_format.go` registers.

## Audit (TASK-267)

Go means the export already called the bridge before TASK-267, moved means
TASK-267 moved its logic to Go (`pkg/ajan/formatfx`), and TS means it stays in
TypeScript, for the reason given. Fidelity decides the codecs: a codec moves
only if a round trip through the bridge gives the same JavaScript values and
text as the TypeScript codec, which is what the `Format` objects, the stream
layers and `@eserstack/cs` (`yamlFormat.writeItem` in `sync.ts`) call.

| Export                                                                                                                                                        | Where | Reason or Go entry                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `serialize`                                                                                                                                                   | Go    | `formatEncode` (a value) and `formatEncodeDocument` (an array), with the registry as a kept fallback (below)                                                                                                                               |
| `deserialize`                                                                                                                                                 | Go    | `formatDecode`, with the registry as a kept fallback (below)                                                                                                                                                                               |
| `ffiFormats`                                                                                                                                                  | Go    | `formatEncode`, `formatEncodeDocument`, `formatDecode`, `formatList`, no fallback                                                                                                                                                          |
| `csvFormat.createReader`                                                                                                                                      | moved | `formatReadCsv` (`formatfx.ReadCSV`), synchronously through `requireLibSync()`; the reader keeps the state Go answers between chunks                                                                                                       |
| `csvFormat.writeStart`, `writeItem`, `writeEnd`                                                                                                               | TS    | Fidelity: see CSV writer below                                                                                                                                                                                                             |
| `jsonFormat`                                                                                                                                                  | TS    | Thin adapter over the runtime's `JSON.stringify` and `JSON.parse`, the calls the bridge itself makes to send each request and read each answer; a Go path would run both around a round trip and remove no logic. See JSON and JSONL below |
| `jsonlFormat`                                                                                                                                                 | TS    | Thin adapter, as `jsonFormat`: one `JSON.stringify` or `JSON.parse` per line                                                                                                                                                               |
| `yamlFormat`                                                                                                                                                  | TS    | Fidelity: see YAML below                                                                                                                                                                                                                   |
| `tomlFormat`                                                                                                                                                  | TS    | Fidelity: see TOML below                                                                                                                                                                                                                   |
| `streamLayers.writerLayer`, `streamLayers.readerLayer`                                                                                                        | TS    | Thin adapter: wraps a registered `Format` in a `@eserstack/streams` layer and calls its own writer and reader, so each format's path applies (`readerLayer("csv")` reads in Go). The chunk state lives in the format's reader              |
| `registerBuiltinFormats`, `formatRegistry`, `createRegistry`, `registerFormat`, `unregisterFormat`, `getFormat`, `hasFormat`, `listFormats`                   | TS    | The registry holds `Format` objects, whose members are JavaScript functions that cannot cross the bridge                                                                                                                                   |
| `FormatError`, `FormatNotFoundError`, `SerializationError`, `DeserializationError`                                                                            | TS    | Thin adapter: the error classes the package throws                                                                                                                                                                                         |
| `encodeWith`, `encodeDocumentWith`, `decodeWith`, `listFormatsWith`                                                                                           | TS    | Thin adapter: each calls one method of the `Loader` it is given                                                                                                                                                                            |
| `FormatFfiError`, `FORMAT_ENCODE_FAILED`, `FORMAT_DECODE_FAILED`, `FORMAT_NOT_FOUND`, `FORMAT_LIST_FAILED`                                                    | TS    | Thin adapter: the error class and codes of `ffiFormats`                                                                                                                                                                                    |
| `Format`, `FormatOptions`, `FormatReader`, `FormatRegistry`, `WriteOptions`, `Loader`, `FormatEncodeOptions`, `FormatEncodeDocumentOptions`, `FormatListItem` | TS    | Type                                                                                                                                                                                                                                       |

`./business` re-exports the `Loader` functions, types and errors, and
`./adapters/ffi` re-exports `ffiFormats`; their rows are the ones above.
`formats/csv-codec.ts` is internal and keeps only the writer (`formatField`,
`formatRow`, `assertDelimiter`).

Deleted in TASK-267: the TypeScript CSV record parser in `csv-codec.ts`
(`createRecordParser`, `CsvParseError`, `RecordParser`) and the header and
field-count logic of `csv.ts`'s reader, which `formatfx.ReadCSV` now holds.
formatfx's own CSV `FormatReader` (behind `formatDecode`) runs on `ReadCSV`
too, in place of its `encoding/csv` reader, so Go has one CSV reader.

### Why the other codecs stay in TypeScript

Each answer crosses the bridge as JSON, and each request is
`JSON.stringify`-ed on the way in. Checked on Node 26.12.1 with the
dependencies of this package:

- **JSON and JSONL.** The TypeScript codecs are `JSON.stringify` and
  `JSON.parse` with separators. formatfx decodes into Go maps, which lose the
  key order of the document (the bridge's answer lists keys sorted), and its
  encoder sorts keys too (README, Go and TypeScript Output). Keeping the order
  would mean sending the document's own text back, which `JSON.parse` then
  reads again: the same work as today plus a round trip.
- **YAML** (`yaml`). `yaml.parse` returns NaN for `.nan`, Infinity for `.inf`
  and -0 for `-0`; JSON cannot carry NaN or Infinity, so the bridge fails on
  them (`marshal item: json: unsupported value: NaN` from `formatDecode`).
  formatfx decodes with `yaml.v3` into Go maps, losing key order. On the way
  in, `JSON.stringify` turns NaN and Infinity into null, -0 into 0, a `Date`
  into a string and a `Map` into `{}`, where `yaml.stringify` writes `.nan`, a
  timestamp and a `!!omap`. The layout (YAML 1.1 quoting, line folding) is the
  `yaml` library's own, which a Go encoder would have to reproduce.
- **TOML** (`smol-toml`). `parse` returns tables with a null prototype,
  `TomlDate` values (a `Date` subclass) for dates and times, NaN and Infinity
  for `nan` and `inf`, and rejects an integer it cannot hold exactly
  (`9007199254740993`). formatfx decodes with `BurntSushi/toml` into Go maps:
  key order lost, dates as `time.Time` that reach JavaScript as strings,
  plain-prototype objects after `JSON.parse`, and integers past 2^53 accepted
  and rounded. `stringify` writes `[ 80, 443 ]` and no empty parent tables,
  which `BurntSushi/toml` writes differently (README).
- **CSV writer.** `formatField` writes a value with `String()` or, for an
  object, `JSON.stringify`, and `writeItem` treats a value that is not a plain
  object (an array, a class instance, a null-prototype object) as
  `{ value: x }`. After the request's `JSON.stringify`, NaN would arrive as
  null and be written as an empty field instead of `NaN`, a `Date` as a string
  written bare instead of the quoted JSON string
  (`"""1970-01-01T00:00:00.000Z"""`), and Go could not tell a class instance
  from a plain object.

Matching these in Go would take a value encoding beside JSON (tagged NaN,
Infinity, -0, dates, null prototypes) on both sides of the bridge and a port of
both libraries' output layout: a much larger change than this package's move.

**config's open rows.** `@eserstack/config` kept YAML and TOML decoding
(`file/loader.ts`, `manifest.ts`) in TypeScript, marked "TS (open)", waiting for
this step. No Go codec with the needed fidelity exists: the reasons above are
config's reasons (key order, `TomlDate`, null prototypes, NaN and Infinity), so
those rows can close as TS with this fidelity reason.

### Kept fallbacks

| Path                                                 | Why it stays                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The registry branch of `serialize` and `deserialize` | It is how a custom format registered only in TypeScript is served, after Go answers that it does not know the format. For the built-in names it runs the TypeScript codecs that stay as the `Format` objects anyway, so there is no duplicate code to delete, and it answers what the Go path cannot: `deserialize` of YAML `.nan` or `.inf` and TOML `nan` or `inf` returns NaN and Infinity only through it, since the bridge fails to send them as JSON |

This fallback fits neither reason TASK-267 names for a kept fallback (browser
code, the path laroux needs without the native library): nothing in the
repository runs `@eserstack/formats` in a browser, and laroux does not reach it
(below). It is kept because removing it would break the inputs above and
custom formats, and it costs no code.

What imports the package: only `@eserstack/cs` (`generate.ts` calls
`serialize`, `sync.ts` calls `yamlFormat.writeItem`), which no laroux package
imports. `@eserstack/config` and `@eserstack/codebase` use `yaml` and
`smol-toml` directly, not this package. No laroux package depends on
`@eserstack/formats`, and `pkg/@eserstack/laroux-bundler/system.test.ts`
passes with `ESER_AJAN=disabled`.

With `ESER_AJAN=disabled`, `csvFormat.createReader()`'s `push` and `flush`
throw the bridge's load error (`eser-ajan native library unavailable: ...`,
with the load failure as `cause`), and so do `deserialize(text, "csv")` and
`streamLayers.readerLayer("csv")`, which call that reader. `serialize` and
`deserialize` for JSON, JSONL, YAML and TOML, and `serialize` for CSV, keep
working on the TypeScript codecs. `bridge.test.ts` checks both in a child
process.

### Fixtures

`pkg/ajan/formatfx/testdata/csv_read_cases.json` was written from the answers
of the TypeScript reader before it was deleted: 73 cases of chunks, options and
the items or error each `push` and the final `flush` gave (row endings, blank
lines, quoting across chunks, several-character delimiters, header trimming
with JavaScript's whitespace, repeated and `__proto__` headers, integer-like
header names, field-count and quoting errors, bad delimiters, and every split
of one text into two chunks). Both sides run it: `csv_read_fixtures_test.go` in
Go, and `bridge.test.ts` here, through `EserAjanCall` directly and through
`csvFormat.createReader`, checking key order as well as values.
`pkg/@eserstack/ajan/wasm/profile-parity.test.ts` calls `formatReadCsv` on the
WASM reactor and on the native library and compares the answers.

## 1. Input marshalling

Five names of the ajan dispatcher ABI (TASK-238), each reached with
`lib.call(name, request)`. The request is an object, which the library encodes
as JSON for `EserAjanCall`; the request and answer types are in the ajan
binding table (`ffi/bindings.ts`).

**Encode single item** (`formatEncode`):

```ts
lib.call("formatEncode", {
  format,
  data: <jsonValue>,
  pretty?,
  indent?,
  isFirst?,
  document?,
});
```

`serialize()` sends a value that is not an array here, with `isFirst: true` and
`document: true`: the value is a whole document, not one entry of a list. The
bridge passes `document` on as `formatfx.FormatOptions.Document`, so JSON writes
the value without array separators, YAML writes it as itself instead of a
one-item sequence, and TOML writes the table without a `+++` line.

**Encode document** (`formatEncodeDocument`):

```ts
lib.call("formatEncodeDocument", { format, items: <jsonArray>, pretty?, indent? });
```

**Decode** (`formatDecode`):

```ts
lib.call("formatDecode", { format: string, text: string, headers?: string[] });
```

**List formats** (`formatList`):

```ts
lib.call("formatList"); // no request
```

**Read CSV** (`formatReadCsv`), one call per `push` and one for `flush`:

```ts
lib.call("formatReadCsv", { chunk, final, delimiter, state });
```

```json
{
  "chunk": "name,notes\napp1,\"first\n",
  "final": false,
  "delimiter": ",",
  "state": { "rest": "", "headers": null, "records": 0 }
}
```

- `chunk`: the text pushed; `flush` sends `""` with `final: true`
- `delimiter`: a comma when left out
- `state`: what the last answer gave; the first call sends `rest: ""`,
  `records: 0` and the `headers` option, or null to read them from the first
  record. An empty `headers` array stays empty and refuses every record, as
  before.

The state travels with each call instead of living behind a handle, unlike the
bridge's streams (`parsingTokenizeStream` keeps its tokenizer in Go until it is
closed): a reader that is dropped without `flush` leaves nothing open in Go, and
the WASM reactor holds no reader state either.

## 2. Output marshalling

`lib.call` answers the parsed JSON, error answers included:

- Encode: `{ "result": "<encoded string>", "error"?: "..." }`
- EncodeDocument: `{ "result": "<encoded string>", "error"?: "..." }`
- Decode: `{ "items": [<jsonValues>...], "error"?: "..." }`
- List:
  `{ "formats": [{"name","extensions","streamable"},...], "error"?: "..." }`
- Read CSV:
  `{ "items": [{"name": "app1", "notes": "first\nsecond"}], "state": {"rest": "", "headers": ["name", "notes"], "records": 2} }`.
  Each item lists its keys in header order; a repeated header keeps its first
  position and last value and `__proto__` is left out, so `JSON.parse` builds
  the object the TypeScript reader built by assignment (integer-like keys
  first, as any JavaScript object orders them).

Note: `items` in decode are native JSON values (objects, arrays, numbers,
booleans). JSON keeps the types, but not NaN or Infinity (see above).

## 3. Error protocol

Format errors come from Go's `formatfx.GetFormat` or encoding/decoding errors.
`ffiFormats` matches substrings:

- `"format not found"`, `"not registered"`, or `"not found in registry"` →
  `FORMAT_NOT_FOUND` (actual Go string verified:
  `[<name>] format '<name>' not found in registry`)
- encode failures → `FORMAT_ENCODE_FAILED`
- decode failures → `FORMAT_DECODE_FAILED`
- list failures → `FORMAT_LIST_FAILED`

`formatReadCsv` answers the reader's own messages, word for word what the
TypeScript reader threw: `CSV record <n>: a quote inside an unquoted field`,
`CSV record <n>: text after a closing quote`,
`CSV record <n>: unterminated quoted field`,
`The record has <n> fields, but the header has <m> fields`, and
`CSV delimiter "<delimiter>" must be non-empty and hold no quote, CR or LF`.
The reader throws `DeserializationError` with
`Failed to deserialize CSV row: <message>` from `push` and
`Failed to deserialize CSV: <message>` from `flush`, `format` `"csv"` and an
`Error` with the message as `cause`. When the bridge does not load, it throws
the error of `requireLibSync()` itself.

## 4. Memory ownership

Same as all packages. Go allocates each answer with `C.CString`; the ajan
library copies it and frees it with `EserAjanFree` itself. TS never sees a C
string.

## 5. Sync vs async

The four `ffiFormats` methods, `serialize` and `deserialize` return a
`Promise` and await the bridge's load (`ensureLib()`). The CSV reader's `push`
and `flush` are synchronous, so they take the bridge from `requireLibSync()`,
which loads it synchronously on first use.

## 6. WASM

`bridge_format.go` builds with `!wasip1 || eserajan_wasi`, so the five names
are in the wasi profile (`wasm: "yes"`). `formatfx.ReadCSV` uses only `bytes`,
`encoding/json`, `fmt` and `strings`, which the profile already links; with it
the profile is 7,839,419 bytes raw and 1,505,392 brotli.

## Behavioral divergences

### TASK-267

- `csvFormat.createReader()` needs the bridge (native or WASM). With neither,
  `push` and `flush` throw the bridge's load error where the TypeScript reader
  used to answer, and so do `deserialize` of CSV and `readerLayer("csv")`.
- The `cause` of the reader's `DeserializationError` is an `Error` carrying
  Go's message, which is the old message; it used to be a `CsvParseError` with
  a `record` field, or a `TypeError` for a bad delimiter.
- Text crosses the bridge as UTF-8, so a lone surrogate in a chunk (or a
  surrogate pair split across two chunks) becomes U+FFFD in the fields, where
  the TypeScript reader kept the UTF-16 unit.
- After a `push` or `flush` that threw, the next call starts from the state of
  the last call that succeeded; the TypeScript reader had already consumed the
  records before the one that failed.
- `formatDecode` of CSV (`deserialize` with the bridge loaded, and
  `ffiFormats.decode`) reads with `ReadCSV` instead of `encoding/csv`: keys in
  header order instead of sorted, header names trimmed, whitespace-only lines
  skipped, a `__proto__` header dropped, and the TypeScript reader's error
  messages. These are what the TypeScript reader returned.

### Before TASK-267

Discovered 2026-04-17 by running `formats.test.ts`. All 8 divergences resolved
as of 2026-04-17 (Track B).

| Test                                                              | Expected (TS behavior)                               | Resolution                                                                                                                                                                                                   | Status                                                    |
| ----------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| serialize() → should serialize YAML array with separator          | multi-doc YAML with `---` between each item          | Go uses single-doc sequence notation (`- item`); both are valid YAML. Test updated to check for `"- "` presence instead of `"---"`.                                                                          | `RESOLVED_BY_TS_TEST_UPDATE` (`formats.test.ts`)          |
| serialize() → should serialize CSV format                         | header row emitted first (`name,...`)                | `format_csv.go` `WriteItem` now auto-emits sorted header row when `opts.IsFirst && data is map[string]any`. Covered by `TestFormatCSV_HeaderRoundtrip`.                                                      | `RESOLVED_IN_GO` (`pkg/ajan/formatfx/format_csv.go`)      |
| serialize() → should reject non-object data for TOML              | throws on non-object item                            | `format_toml.go` `WriteItem` now checks `map[string]any` and returns `ErrTOMLRootNotObject` for primitives/slices. Covered by `TestFormatTOML_RejectNonObjectRoot`.                                          | `RESOLVED_IN_GO` (`pkg/ajan/formatfx/format_toml.go`)     |
| deserialize() → should deserialize CSV with auto-detected headers | `result[0]["name"] === "app1"`                       | The Go CSV reader takes the first record as the header row when no headers are given. Covered by `TestFormatCSV_HeaderRoundtrip`.                                                                            | `RESOLVED_IN_GO` (`pkg/ajan/formatfx/format_csv.go`)      |
| deserialize() → should deserialize CSV with provided headers      | `result[0]["name"] === "app1"` with provided headers | Go FFI decode now takes `headers` (`bridgeFormatDecode` passes them to `formatfx.FormatOptions`), and `deserializer.ts` sends `options.headers` to Go.                                                       | `RESOLVED_IN_GO` (`pkg/@eserstack/ajan/bridge_format.go`) |
| deserialize() → should throw error for malformed YAML             | throws on invalid YAML                               | `format_yaml.go` `Flush` now propagates non-`io.EOF` errors from `yaml.Decoder.Decode`. Go YAML properly rejects broken input. No TS change needed.                                                          | `RESOLVED_IN_GO` (`pkg/ajan/formatfx/format_yaml.go`)     |
| roundtrip → YAML serialize/deserialize                            | `[{name:"app1",...},{name:"app2",...}]`              | `format_yaml.go` `WriteItem` wraps each item in `[]any{data}` producing sequence entries; `Flush` expands top-level `[]any` via `items = append(items, seq...)`. Covered by `TestFormatYAML_ArrayRoundtrip`. | `RESOLVED_IN_GO` (`pkg/ajan/formatfx/format_yaml.go`)     |
| roundtrip → TOML serialize/deserialize                            | `[{name:"app1",...},{name:"app2",...}]`              | `format_toml.go` `WriteItem` appends `+++\n` separator; `Flush` splits on `+++\n` to decode each document. Covered by `TestFormatTOML_ArrayRoundtrip`.                                                       | `RESOLVED_IN_GO` (`pkg/ajan/formatfx/format_toml.go`)     |

Three more, found 2026-10-05 (TASK-128), are resolved in Go: the `document` flag
above makes YAML write a single value as one mapping, `format_toml.go` writes
whole-number `float64` values within +-2^53 as integers, and `format_json.go`
lays out arrays as `JSON.stringify` does. The package README lists the
differences that remain.
