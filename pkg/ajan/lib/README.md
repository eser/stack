# 🧰 [ajan/lib](./)

> **eserstack Go library** in the root module `github.com/eser/stack`. Import
> `github.com/eser/stack/pkg/ajan/lib`. The module is not published for
> `go get`: build inside this repository, or require `github.com/eser/stack`
> with a `replace` directive that points at a checkout.

`lib` is a utility library of helpers the other ajan packages share: IDs,
environment handling, string, slug and path manipulation, bounded reads,
case-insensitive map access, and sleeps that end with a context. It depends on
the standard library, `github.com/oklog/ulid/v2` and `golang.org/x/text`. The
networking, certificate and SQL helpers are in [lib/netlib](./netlib/README.md),
so a package that needs only these does not link `net`, `crypto/tls` and
`database/sql`.

## Key Features

- **Environment Handling**: Environment-aware file loading, variable overrides
- **String Utilities**: Unicode-aware trimming, slugs
- **Path Utilities**: File path parsing and home directory expansion
- **Array Utilities**: Generic slice concatenation and copying
- **I/O Utilities**: Reading a stream to the end under a size limit
- **Map Utilities**: Case-insensitive map operations
- **ID Generation**: ULID-based unique identifiers, trace and span IDs
- **Logging Utilities**: Structured logging attribute serialization

## Quick Start

Each helper is a plain function:

```go
package main

import (
	"fmt"
	"strings"

	"github.com/eser/stack/pkg/ajan/lib"
)

func main() {
	fmt.Println(lib.IDsGenerateUnique())
	fmt.Println(lib.Slugify("Héllo, Wörld!"))
	fmt.Println(lib.EnvAwareFilenames("production", "config.json"))

	_, err := lib.ReadAllLimited(strings.NewReader("payload"), 4)
	fmt.Println(err)
}
```

It prints a new ULID on the first line, then:

```text
hello-world
[config.json config.production.json config.local.json config.production.local.json]
read limit exceeded: more than 4 bytes
```

## ID Generation

`IDsGenerateUnique` returns a ULID (Universally Unique Lexicographically
Sortable Identifier) such as `01ARZ3NDEKTSV4RRFFQ69G5FAV`. ULIDs sort by the
millisecond they were made in, and `ulid.Make`, which this function calls, keeps
the IDs made in one process within the same millisecond in order.

```go
// func IDsGenerateUnique() string
// func GenerateHexID(byteLength int) string
// func GenerateTraceID() string
// func GenerateSpanID() string

userID := lib.IDsGenerateUnique()
traceID := lib.GenerateTraceID() // 32 hex characters (128 bits)
spanID := lib.GenerateSpanID()   // 16 hex characters (64 bits)
```

`GenerateHexID` returns `byteLength` random bytes from `crypto/rand` as hex.

## Environment Handling

### EnvGetCurrent

Returns the current environment name: the `env` environment variable in lower
case, or `development` when it is unset or empty.

```go
// func EnvGetCurrent() string

env := lib.EnvGetCurrent()
```

### EnvAwareFilenames

Generates environment-aware filenames for configuration loading, in the order
they should be read. The test environment skips the `.local` file, so a
developer's local overrides do not change test runs.

```go
// func EnvAwareFilenames(env string, filename string) []string

filenames := lib.EnvAwareFilenames("production", "config.json")
// ["config.json", "config.production.json", "config.local.json", "config.production.local.json"]

filenames = lib.EnvAwareFilenames("test", "app.yaml")
// ["app.yaml", "app.test.yaml", "app.test.local.yaml"]
```

### EnvOverrideVariables

Copies the process environment into a map. With `keyCaseInsensitive`, a variable
overwrites an existing key that matches it in any case and keeps that key's
spelling, so `DATABASE_URL` updates an existing `database_url` entry.

```go
// func EnvOverrideVariables(m *map[string]any, keyCaseInsensitive bool)

config := map[string]any{"database_url": "postgres://localhost/dev"}
lib.EnvOverrideVariables(&config, true)
```

## String Utilities

### String Trimming Functions

Trimming that removes every Unicode space character (`unicode.IsSpace`):

```go
// func StringsTrimLeadingSpace(src string) string
// func StringsTrimTrailingSpace(src string) string
// func StringsTrimLeadingSpaceFromBytes(src []byte) []byte
// func StringsTrimTrailingSpaceFromBytes(src []byte) []byte

trimmed := lib.StringsTrimLeadingSpace("   hello world")
// "hello world"

data := []byte("   hello world   ")
trailing := lib.StringsTrimTrailingSpaceFromBytes(data)
// []byte("   hello world")
```

### Slugify and SanitizeSlug

Both remove accents (`é` becomes `e`) and lowercase the text. `Slugify` makes a
URL slug from a title: it drops other characters, joins words with hyphens and
trims hyphens at the ends. `SanitizeSlug` cleans a slug a user typed: it
replaces each other character with a hyphen and keeps hyphens at the ends.

```go
slug := lib.Slugify("Héllo, Wörld!  Again")
// "hello-world-again"

cleaned := lib.SanitizeSlug("My Slug!")
// "my-slug-"
```

## Path Utilities

`PathsSplit` splits a file path into directory, basename, and extension.
`ExpandPath` replaces a leading `~/` with the user's home directory and returns
other paths unchanged.

```go
// func PathsSplit(filename string) (string, string, string)
// func ExpandPath(path string) (string, error)

dir, name, ext := lib.PathsSplit("/path/to/config.json")
// dir = "/path/to/", name = "config", ext = ".json"

dir, name, ext = lib.PathsSplit("app.go")
// dir = "", name = "app", ext = ".go"

configPath, err := lib.ExpandPath("~/.config/app.json")
```

## Array Utilities

`ArraysCopy` concatenates any number of slices into a new slice, so the result
shares no backing array with its inputs:

```go
// func ArraysCopy[T any](items ...[]T) []T

result := lib.ArraysCopy([]string{"a", "b"}, []string{"c", "d"}, []string{"e"})
// ["a", "b", "c", "d", "e"]
```

## I/O Utilities

`ReadAllLimited` reads a reader to the end like `io.ReadAll`, but holds at most
`limit` bytes. When the reader has more, it returns an error wrapping
`lib.ErrReadLimitExceeded` instead of a truncated result.

```go
// func ReadAllLimited(r io.Reader, limit int64) ([]byte, error)

const maxManifestBytes = 1 << 20 // 1 MiB

data, err := lib.ReadAllLimited(resp.Body, maxManifestBytes)
if errors.Is(err, lib.ErrReadLimitExceeded) {
	return fmt.Errorf("manifest %s is larger than %d bytes: %w", manifestURL, maxManifestBytes, err)
}

if err != nil {
	return fmt.Errorf("read manifest %s: %w", manifestURL, err)
}
```

## Map Utilities

`CaseInsensitiveGet` looks up a key, preferring an exact match and falling back
to a case-insensitive one. `CaseInsensitiveSet` updates the existing key that
matches in any case, keeping its spelling, or adds the key when none matches.

```go
// func CaseInsensitiveGet(m map[string]any, key string) (any, bool)
// func CaseInsensitiveSet(m *map[string]any, key string, value any)

config := map[string]any{"DATABASE_URL": "postgres://localhost/db1"}

databaseURL, found := lib.CaseInsensitiveGet(config, "database_url")
// databaseURL = "postgres://localhost/db1", found = true

lib.CaseInsensitiveSet(&config, "database_url", "postgres://localhost/db2")
// config["DATABASE_URL"] is now "postgres://localhost/db2"
```

## Logging Utilities

`SerializeSlogAttrs` joins attributes into one `key=value` string, and
`GetSlogAttrs` collects the attributes of a `slog.Record` into a slice:

```go
// func SerializeSlogAttrs(attrs []slog.Attr) string
// func GetSlogAttrs(rec slog.Record) []slog.Attr

serialized := lib.SerializeSlogAttrs([]slog.Attr{
	slog.String("user_id", "12345"),
	slog.Int("status_code", 200),
})
// "user_id=12345, status_code=200"
```

## Sleeping With a Context

`SleepContext` waits for `delay` and `SleepUntilContext` until `targetTime`;
both return early when the context ends. Neither returns an error, so check
`ctx.Err()` afterwards when you need to know which happened:

```go
// func SleepContext(ctx context.Context, delay time.Duration)
// func SleepUntilContext(ctx context.Context, targetTime time.Time)

lib.SleepContext(ctx, 2*time.Second)

if ctx.Err() != nil {
	return fmt.Errorf("wait before retry: %w", ctx.Err())
}
```

## MIME Types

`EnsureMimetypesRegistered` adds audio types to the `mime` package's table:
`.mp3` (`audio/mpeg`), `.wav` (`audio/wav`), `.ogg` (`audio/ogg`), and `.mp4`
and `.m4a` (`audio/mp4`). Call it once at start-up, before
`mime.TypeByExtension` needs them.

## Concurrency

The functions keep no state of their own and can be called from any number of
goroutines. The map helpers read and write the map you pass without locking, so
guard a map that several goroutines share. `EnsureMimetypesRegistered` changes
the process-wide `mime` table.

## 🔗 Links

- `go doc github.com/eser/stack/pkg/ajan/lib`: the API reference generated from
  source
- [ajan/configfx](../configfx/README.md): uses the environment helpers to find
  and read config files
- [eser/stack on GitHub](https://github.com/eser/stack)
