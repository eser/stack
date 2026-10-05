# ✅ [ajan/results](./)

> **eserstack Go library** in the root module `github.com/eser/stack`. Import
> `github.com/eser/stack/pkg/ajan/results`. The module is not published for
> `go get`: build inside this repository, or require `github.com/eser/stack`
> with a `replace` directive that points at a checkout.

`results` gives operation outcomes a stable code. A `Definition` names a code, a
message and a kind (success or error), and each `Result` made from it can wrap
an error and carry `log/slog` attributes. A `Result` implements `error`, so an
error result travels through ordinary Go error handling and still prints its
code in logs and responses. `httpfx` builds its route results on this package.

## Quick Start

Define each outcome once, then return a `Result` from it:

```go
package main

import (
	"fmt"
	"log/slog"
	"strconv"

	"github.com/eser/stack/pkg/ajan/results"
)

var (
	resPortOK = results.Define(
		results.ResultKindSuccess, "PORT001", "Port accepted",
	)
	resPortInvalid = results.Define(
		results.ResultKindError, "PORT002", "Invalid port",
	)
)

func checkPort(input string) results.Result {
	port, err := strconv.Atoi(input)
	if err != nil {
		return resPortInvalid.Wrap(err).
			WithAttribute(slog.String("input", input))
	}

	if port < 1 || port > 65535 {
		return resPortInvalid.New().WithAttribute(slog.Int("port", port))
	}

	return resPortOK.New().WithAttribute(slog.Int("port", port))
}

func main() {
	for _, input := range []string{"8080", "http", "70000"} {
		result := checkPort(input)
		fmt.Println(result.IsError(), result)
	}
}
```

It prints:

```text
false [PORT001] Port accepted (port=8080)
true [PORT002] Invalid port (input=http): strconv.Atoi: parsing "http": invalid syntax
true [PORT002] Invalid port (port=70000)
```

## Definitions

`Define` creates a `Definition`. Keep definitions in package-level variables, so
every caller returns the same code for the same outcome:

```go
// func Define(kind ResultKind, code string, message string, attributes ...slog.Attr) *Definition

var (
	resOk       = results.Define(results.ResultKindSuccess, "OP001", "OK")
	resNotFound = results.Define(results.ResultKindSuccess, "OP002", "Not Found")
	resFailure  = results.Define(results.ResultKindError, "OP003", "Fail")
)
```

The kind is `results.ResultKindSuccess` or `results.ResultKindError`; its
`String` method returns `Success` or `Error`. Attributes passed to `Define`
appear on every result made from that definition. The package also exports
`results.Ok`, a success definition with the code and message `OK`.

## Creating Results

A `Definition` makes results in two ways:

- `New(payload ...any)` returns a result with no inner error.
- `Wrap(err error, payload ...any)` returns a result that wraps `err`.

The payload is kept in the `InnerPayload` field for your own use; `String` does
not print it. `WithAttribute(attributes ...slog.Attr)` and `WithError(err)`
return a copy of the result with attributes added or the inner error replaced,
so they chain:

```go
// func (r *Definition) New(payload ...any) Result
// func (r *Definition) Wrap(err error, payload ...any) Result

result := resFailure.Wrap(err).WithAttribute(
	slog.String("pattern", pattern),
	slog.String("method", method),
)
```

## Inspecting Results

`Result` is a struct with these methods:

- `Error() string`: returns the same text as `String`.
- `Unwrap() error`: returns the wrapped error, so `errors.Is` and
  `errors.AsType` reach it.
- `IsSuccess() bool` and `IsError() bool`: report the kind of the definition.
- `String() string`: returns `[CODE] Message`, then the attributes in
  parentheses when there are any, then `:` and the wrapped error's text when
  there is one.
- `Attributes() []slog.Attr`: returns the definition's attributes followed by
  the ones added with `WithAttribute`.

The Quick Start's second result matches the cause it wraps:

```go
result := checkPort("http")

if errors.Is(result, strconv.ErrSyntax) {
	// The input was not a number.
}
```

A success result is an `error` value too. Return a `Result` through an `error`
return value only when `IsError` reports true, because a non-nil `error` means
failure to every caller.

## 🔗 Links

- `go doc github.com/eser/stack/pkg/ajan/results`: the API reference generated
  from source
- [ajan/httpfx](../httpfx/README.md): route results built on this package
- [eser/stack on GitHub](https://github.com/eser/stack)
