# 🧰 [ajan/lib](./)

> **eserstack Go library** in the root module `github.com/eser/stack`. Import
> `github.com/eser/stack/pkg/ajan/lib`. The module is not published for
> `go get`: build inside this repository, or require `github.com/eser/stack`
> with a `replace` directive that points at a checkout.

`lib` is a utility library of helpers the other ajan packages share: networking
and outbound URL checks, cryptography, IDs, environment handling, string, slug
and path manipulation, bounded reads, case-insensitive map access, a nullable
SQL string with JSON support, and sleeps that end with a context. It depends on
the standard library, `github.com/oklog/ulid/v2` and `golang.org/x/text`.

## Key Features

- **Network Utilities**: Host/port splitting, local and private address checks,
  outbound URL validation against SSRF
- **Cryptography**: Self-signed certificate generation, random byte generation
- **Environment Handling**: Environment-aware file loading, variable overrides
- **String Utilities**: Unicode-aware trimming, slugs
- **Path Utilities**: File path parsing and home directory expansion
- **Array Utilities**: Generic slice concatenation and copying
- **I/O Utilities**: Reading a stream to the end under a size limit
- **Map Utilities**: Case-insensitive map operations
- **SQL Types**: Nullable SQL string with JSON support
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

	err := lib.ValidateExternalURL("http://127.0.0.1/admin", false)
	fmt.Println(err)

	_, err = lib.ReadAllLimited(strings.NewReader("payload"), 4)
	fmt.Println(err)
}
```

It prints a new ULID on the first line, then:

```text
hello-world
[config.json config.production.json config.local.json config.production.local.json]
URL resolves to a private or reserved IP address: 127.0.0.1
read limit exceeded: more than 4 bytes
```

## Network Utilities

### SplitHostPort

Splits a network address into host and port components. An address without a
port, including a bare IPv6 address, returns the whole address as the host and
an empty port.

```go
// func SplitHostPort(addr string) (string, string, error)

host, port, err := lib.SplitHostPort("localhost:8080")
// host = "localhost", port = "8080", err = nil

host, port, err = lib.SplitHostPort("localhost")
// host = "localhost", port = "", err = nil

host, port, err = lib.SplitHostPort("[::1]:8080")
// host = "::1", port = "8080", err = nil

host, port, err = lib.SplitHostPort("2001:db8::1")
// host = "2001:db8::1", port = "", err = nil
```

A malformed address returns an error wrapping `lib.ErrFailedToSplitHostPort`.

### DetectLocalNetwork

Reports whether a request address comes from this machine: it returns true when
the address is a loopback address inside the network of one of the local
interfaces. When `requestAddr` holds a comma-separated list (as
`X-Forwarded-For` does), only the first entry is checked.

```go
// func DetectLocalNetwork(requestAddr string) (bool, error)

isLocal, err := lib.DetectLocalNetwork("127.0.0.1:54321")
// isLocal = true, err = nil

isLocal, err = lib.DetectLocalNetwork("10.0.0.1:80,203.0.113.1:80")
// isLocal = false: 10.0.0.1 is a private address, not a loopback one
```

An entry that is not an IP address returns an error wrapping
`lib.ErrInvalidIPAddress`.

### IsPrivateIP and ValidateExternalURL

`IsPrivateIP` reports whether an IP string falls in a private or reserved range:
`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`,
`169.254.0.0/16`, `0.0.0.0/8`, `100.64.0.0/10`, `::1/128`, `fc00::/7` and
`fe80::/10`. A string that does not parse returns false.

`ValidateExternalURL` checks a URL before an outbound request, to block
Server-Side Request Forgery (SSRF). It accepts only `http` and `https` (only
`https` when `requireHTTPS` is true), resolves the host name, and rejects the
URL when any resolved address is private or reserved:

```go
// func ValidateExternalURL(rawURL string, requireHTTPS bool) error

err := lib.ValidateExternalURL(webhookURL, true)
if errors.Is(err, lib.ErrSSRFBlocked) {
	return fmt.Errorf("webhook %q points at an internal address: %w", webhookURL, err)
}

if err != nil {
	return fmt.Errorf("check webhook %q: %w", webhookURL, err)
}
```

The errors wrap `lib.ErrInvalidURL`, `lib.ErrInsecureScheme` or
`lib.ErrSSRFBlocked`. The check resolves the name when you call it, and the HTTP
client resolves it again when it connects.

## Cryptography

### CryptoGetRandomBytes

Returns `size` bytes from `crypto/rand`:

```go
// func CryptoGetRandomBytes(size int) ([]byte, error)

key, err := lib.CryptoGetRandomBytes(32) // a 256-bit key
if err != nil {
	return fmt.Errorf("generate key: %w", err)
}
```

### GenerateSelfSignedCert

Creates a self-signed TLS certificate for development purposes: an RSA key of
2048 bits (`lib.SelfSignedKeyLength`), the organization `Development`, valid for
365 days from now and for server authentication. It names no host, so clients
that verify the chain reject it.

```go
// func GenerateSelfSignedCert() (tls.Certificate, error)

cert, err := lib.GenerateSelfSignedCert()
if err != nil {
	return fmt.Errorf("generate development certificate: %w", err)
}

server := &http.Server{
	Addr:              ":8443",
	ReadHeaderTimeout: 5 * time.Second,
	TLSConfig:         &tls.Config{Certificates: []tls.Certificate{cert}},
}
```

The errors wrap `lib.ErrPrivateKeyGeneration`, `lib.ErrCertificateGeneration` or
`lib.ErrKeyPairCreation`.

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

## SQL Types

`NullString` wraps `sql.NullString` and adds JSON support: an invalid value
encodes as `null`, and `null` decodes as an invalid value. Its methods have
pointer receivers, so marshal a pointer to the struct that holds it:

```go
type User struct {
	Name string         `json:"name"`
	Bio  lib.NullString `json:"bio"`
}

user := User{Name: "Ada"}
user.Bio.String, user.Bio.Valid = "Developer", true

data, err := json.Marshal(&user)
// {"name":"Ada","bio":"Developer"}

err = db.QueryRowContext(ctx, "SELECT bio FROM users WHERE id = ?", userID).
	Scan(&user.Bio)
```

`Scan` accepts a `string`, a `[]byte` or `nil`; any other type returns an error
wrapping `lib.ErrUnexpectedNullStringType`.

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
