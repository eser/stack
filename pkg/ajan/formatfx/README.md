# 🗂️ [ajan/formatfx](./)

> **eserstack Go library** in the root module `github.com/eser/stack`. Import
> `github.com/eser/stack/pkg/ajan/formatfx`. The module is not published for
> `go get`: build inside this repository, or require `github.com/eser/stack`
> with a `replace` directive that points at a checkout.

`formatfx` encodes and decodes JSON, JSONL, CSV, YAML and TOML through one
streaming interface: a `Format` writes a document item by item, and its
`FormatReader` takes text in chunks and returns the decoded items. The ajan
bridge's `formatEncode`, `formatDecode` and `formatReadCsv` functions use it.

## Quick Start

```go
package main

import (
	"fmt"

	"github.com/eser/stack/pkg/ajan/formatfx"
)

func main() {
	formatfx.RegisterBuiltinFormats()

	yaml, err := formatfx.GetFormat("yaml")
	if err != nil {
		panic(err)
	}

	reader := yaml.CreateReader(nil)
	if _, err := reader.Push("name: app\nport: 8080\n"); err != nil {
		panic(err)
	}

	items, err := reader.Flush()
	fmt.Println(items, err)
	// [map[name:app port:8080]] <nil>
}
```

`GetFormat` takes a format name or a file extension (`"yml"`, `"ndjson"`).

## CSV reader

`ReadCSV` is the CSV reader of `@eserstack/formats`, moved from TypeScript, and
the CSV format's `FormatReader` runs on it. It takes one chunk and the state
from the previous call, and returns the rows the chunk completes and the state
for the next call, so the caller keeps the state and nothing stays open between
calls. The bridge's `formatReadCsv` serves it that way.

```go
// func ReadCSV(state CSVReadState, chunk, delimiter string, final bool) ([]CSVRow, CSVReadState, error)
rows, state, err := formatfx.ReadCSV(formatfx.CSVReadState{}, "name,notes\napp1,\"a\n", ",", false)
// rows is empty: the quoted field is still open, and state.Rest holds it
rows, state, err = formatfx.ReadCSV(state, "b\"\n", ",", true)
// rows[0].Get("notes") is "a\nb"
```

The first record that is not blank gives the header names, trimmed of
JavaScript's whitespace, unless `CSVReadState.Headers` is set. A `CSVRow`
marshals to a JSON object with its keys in header order. The errors are
`*CSVDelimiterError`, `*CSVParseError` (with the record number) and
`*CSVFieldCountError`, with the messages of the TypeScript reader.

## Nesting limit

Decoding refuses a document that nests arrays and objects (or YAML sequences and
mappings) deeper than `MaxNestingDepth`, 1,000 levels, with an error that wraps
`ErrNestingTooDeep` and names the limit. Decoding recurses once per level: in
the WASM build of the bridge a few thousand levels overflow the host's stack and
kill the instance, and natively a deep document costs a large goroutine stack.
The check runs before decoding, as a byte scan for JSON, JSONL and TOML and as a
bracket and indentation count for YAML.

```go
// func CheckJSONDepth(text string) error
err = formatfx.CheckJSONDepth(deeplyNested) // 1,001 nested arrays
// errors.Is(err, formatfx.ErrNestingTooDeep) is true
```

`CheckTOMLDepth` and `CheckYAMLDepth` do the same for the other formats.

## 🔗 Links

- `go doc github.com/eser/stack/pkg/ajan/formatfx`: the API reference generated
  from source
- [@eserstack/ajan](../../@eserstack/ajan/README.md): the bridge that exposes
  these formats to TypeScript
- [eser/stack on GitHub](https://github.com/eser/stack)
