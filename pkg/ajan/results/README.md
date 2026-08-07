# ajan/results

## Overview

**results** package provides a structured way to handle and represent
operational results, including errors, within the application.

The documentation below provides an overview of the package, its types,
functions, and usage examples. For more detailed information, refer to the
source code and tests.

## API

### Result interface

Defines the contract for result types.

```go
type Result interface {
	error
	Unwrap() error

	IsError() bool
	String() string
	Attributes() []slog.Attr
}
```

**Methods:**

- `Error() string`: Returns the error message.
- `Unwrap() error`: Returns the underlying error.
- `IsError() bool`: Indicates if the result is an error.
- `String() string`: Returns the string representation of the result.
- `Attributes() []slog.Attr`: Returns the attributes associated with the result.

### Define function

Creates a new `Definition` object.

```go
// func Define(code string, message string, attributes ...slog.Attr) *Definition

var (
  resOk       = results.Define(results.ResultKindSuccess, "OP001", "OK")
  resNotFound = results.Define(results.ResultKindSuccess, "OP002", "Not Found")
  resFailure  = results.Define(results.ResultKindError, "OP003", "Fail")
)
```

### Definition.New and Definitions.Wrap methods

Creates a new `Result` object from a definition.

Example 1:

```go
var (
  resOk       = results.Define(results.ResultKindSuccess, "OP001", "OK")
  resNotFound = results.Define(results.ResultKindSuccess, "OP002", "Not Found")
  resFailure  = results.Define(results.ResultKindError, "OP003", "Fail")
)

// func (r *Definition) New(payload ...any) ResultImpl
// func (r *Definition) Wrap(err error, payload ...any) ResultImpl

func FileOp(filename string) results.Result {
  file, err := os.Open(filepath.Clean(filename))
	if err != nil {
		if os.IsNotExist(err) {
			return resNotFound.New()
		}

    return resFailure.Wrap(err)
  }

  ...

  return resOk.New()
}
```

Example 2:

```go
var (
  resOk                = results.Define(results.ResultKindSuccess, "PARSE001", "OK")
  resSyntaxError       = results.Define(results.ResultKindError, "PARSE002", "Syntax Error")
  resInvalidOperation  = results.Define(results.ResultKindError, "PARSE003", "Invalid Operation")
)

// func (r *Definition) New(payload ...any) ResultImpl
// func (r *Definition) Wrap(err error, payload ...any) ResultImpl

func Parse(...) results.Result {
  if ... {
    // Output: [PARSE002] Syntax Error: host/path missing / (pattern=..., method=...)
    return resSyntaxError.New("host/path missing /").
      WithAttribute(
        slog.String("pattern", str),
        slog.String("method", method),
      )
  }

  if ... {
    // Output: [PARSE003] Invalid Operation: method defined twice (pattern=..., method=...)
    return resSyntaxError.New("method defined twice").
      WithAttribute(
        slog.String("pattern", str),
        slog.String("method", method),
      )
  }

  ...

  // Output: [PARSE001] OK
  return resOk.New()
}

fmt.Println(Parse(...).String())
```
