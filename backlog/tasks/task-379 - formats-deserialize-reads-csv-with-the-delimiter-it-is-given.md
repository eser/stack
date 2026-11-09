---
id: TASK-379
title: 'formats: deserialize reads CSV with the delimiter it is given'
status: Done
assignee: []
created_date: '2026-11-09 09:20'
updated_date: '2026-11-09 12:00'
labels:
  - formats
  - go-delegation
  - bug
milestone: m-6
dependencies: []
priority: medium
ordinal: 382000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found during TASK-267 (formats step). With the bridge loaded, `deserialize` ignores the `delimiter` option of CSV, so a semicolon-separated file is read with commas and no error:

```typescript
await formats.deserialize("a;b\n1;2\n", "csv", { delimiter: ";" });
// [{ "a;b": "1;2" }], where csvFormat.createReader({ delimiter: ";" }) reads [{ a: "1", b: "2" }]
```

Root cause:

- pkg/@eserstack/formats/deserializer.ts:18-22 sends `formatDecode` the format, the text and `headers`, and no `delimiter`.
- pkg/@eserstack/ajan/bridge_format.go:48-52: `formatDecodeRequest` has no delimiter field, and :228-231 build the reader options from `Headers` only, so formatfx's CSV reader takes its default comma (pkg/ajan/formatfx/format_csv.go:77-82).
- Go answers without an error, so deserializer.ts:23-25 returns those items and the TypeScript path at :33-42, which passes `options` to `createReader`, never runs.
- formatfx's `FormatOptions.Delimiter` is a `rune` (pkg/ajan/formatfx/types.go:26), while the TypeScript option is a string and `ReadCSV` takes a string (pkg/ajan/formatfx/csv_read.go:133), so the request field has to carry the string and its errors (`CSVDelimiterError` for an empty delimiter, a quote, CR or LF).

The write direction has the same gap: pkg/@eserstack/formats/serializer.ts:33-46 sends `formatEncodeDocument` and `formatEncode` only `pretty` and `indent`, so `serialize([{ a: 1, b: 2 }], "csv", { delimiter: ";" })` returns `"a,b\n1,2\n"`. `ffiLoader.decode` (pkg/@eserstack/formats/adapters/ffi/loader.ts:74-77) takes no options at all. Both were checked on 2026-11-09 with the native library loaded.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A test written first fails before the fix: `deserialize` of semicolon-separated CSV with `delimiter: ";"` returns the items `csvFormat.createReader({ delimiter: ";" })` returns, on the native library and on the WASM build
- [x] #2 A test written first fails before the fix: `serialize` of CSV with `delimiter: ";"` writes the text `csvFormat`'s writer writes with that delimiter
- [x] #3 `deserialize` with a delimiter `ReadCSV` refuses (empty, a quote, CR or LF) rejects with the reader's message instead of reading with commas, tested
- [x] #4 The bridge's Go tests cover `formatDecode` and the encode names with a delimiter, and the CSV entries of formats WIRING.md list the field
- [x] #5 `pnpm ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause, as described: pkg/@eserstack/formats/deserializer.ts:18-22 and serializer.ts:33-46 sent no `delimiter`, `formatDecodeRequest`, `formatEncodeRequest` and `formatEncodeDocumentRequest` in pkg/@eserstack/ajan/bridge_format.go had no field for one, and `formatfx.FormatOptions.Delimiter` was a `rune` (pkg/ajan/formatfx/types.go:26), which cannot carry an empty or several-character delimiter.

Fix, in Go (decision-22):
- pkg/ajan/formatfx/types.go: `FormatOptions.Delimiter` is a `*string`, nil for a comma, so a delimiter that is given but empty reaches the format instead of turning into the default.
- pkg/ajan/formatfx/format_csv.go: `CreateReader` hands the delimiter to `ReadCSV`, which refuses an empty one or one holding a quote, CR or LF with `*CSVDelimiterError`. `WriteStart` and `WriteItem` build their writer with `newCSVWriter`, which runs the same check and takes one character only (encoding/csv writes with a rune); a longer one fails with `ErrCSVWriteDelimiter`.
- pkg/@eserstack/ajan/bridge_format.go: the three requests take `delimiter` (a comma when left out) and pass it on; `formatDecode` builds reader options when headers or a delimiter are given.
- TypeScript only sends the option: deserializer.ts and serializer.ts send `options.delimiter`, and ffi/bindings.ts types the field. Bridge name counts are unchanged.

Choice left open by the ACs: Go's writer refuses a delimiter of several characters rather than guessing. `serialize` then falls back to the TypeScript writer, as it does for any Go error, which writes with it (rows end with CRLF there) or refuses it with a `SerializationError`; the reader takes such a delimiter, as `ReadCSV` always did. The CSV writer of `csvFormat` stays in TypeScript and already applied its delimiter.

Not changed: `ffiFormats.encode`, `encodeDocument` and `decode` (adapters/ffi/loader.ts) take no delimiter option; adding one is an API addition, not part of this bug.

Tests, written first and seen failing before the fix:
- pkg/@eserstack/formats/bridge.test.ts: "deserialize and serialize use the CSV delimiter they are given" runs in a child process once on the native library (ESER_AJAN_WASM=disabled) and once on the WASM build (ESER_AJAN_NATIVE=disabled), asserting the backend. It failed on both with `[{ "a;b": "1;2" }]`; `serialize` gave `a,b\n1,2\n` and each refused delimiter read `[{ a: "1" }]`. Now `deserialize` returns what `csvFormat.createReader({ delimiter: ";" })` returns, `serialize` writes the `csvFormat` writer's text with LF endings (README, Go and TypeScript Output), and "", a quote, CR and LF reject with `Failed to deserialize CSV row: CSV delimiter "<d>" must be non-empty and hold no quote, CR or LF`. A second test covers `::` (read in Go, written by the TypeScript writer) and `serialize` refusing a quote.
- pkg/@eserstack/ajan/bridge_format_test.go: `TestBridgeFormatDecodeDelimiter` and `TestBridgeFormatEncodeDelimiter` cover `formatDecode`, `formatEncode` and `formatEncodeDocument` with a given, a left-out and each refused delimiter, and a non-CSV format ignoring it; 14 cases failed before the fix.
- pkg/ajan/formatfx/formatfx_test.go: the writer with `;`, its refusals, and the reader with `::` and an empty delimiter.
- pkg/@eserstack/ajan/wasm/profile-parity.test.ts compares CSV `formatDecode`, `formatEncodeDocument` and `formatEncode` calls with a delimiter between the WASM reactor and the native library.

Docs: formats WIRING.md lists `delimiter` in the `formatEncode`, `formatEncodeDocument` and `formatDecode` requests, its errors and a TASK-379 entry; CHANGELOG.md lists the `FormatOptions.Delimiter` type change under Go: pkg/ajan/formatfx and csfx. `pnpm ok` passes.
<!-- SECTION:NOTES:END -->
