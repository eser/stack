# 🗂️ [ajan/formatfx](./)

> **eserstack Go library** in the root module `github.com/eser/stack`. Import
> `github.com/eser/stack/pkg/ajan/formatfx`. The module is not published for
> `go get`: build inside this repository, or require `github.com/eser/stack`
> with a `replace` directive that points at a checkout.

`formatfx` encodes and decodes JSON, JSONL, CSV, YAML and TOML through one
streaming interface: a `Format` writes a document item by item, and its
`FormatReader` takes text in chunks and returns the decoded items. The ajan
bridge's `formatEncode` and `formatDecode` functions use it.

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
