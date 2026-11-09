---
id: TASK-379
title: 'formats: deserialize reads CSV with the delimiter it is given'
status: To Do
assignee: []
created_date: '2026-11-09 09:20'
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
- [ ] #1 A test written first fails before the fix: `deserialize` of semicolon-separated CSV with `delimiter: ";"` returns the items `csvFormat.createReader({ delimiter: ";" })` returns, on the native library and on the WASM build
- [ ] #2 A test written first fails before the fix: `serialize` of CSV with `delimiter: ";"` writes the text `csvFormat`'s writer writes with that delimiter
- [ ] #3 `deserialize` with a delimiter `ReadCSV` refuses (empty, a quote, CR or LF) rejects with the reader's message instead of reading with commas, tested
- [ ] #4 The bridge's Go tests cover `formatDecode` and the encode names with a delimiter, and the CSV entries of formats WIRING.md list the field
- [ ] #5 `pnpm ok` passes
<!-- AC:END -->
