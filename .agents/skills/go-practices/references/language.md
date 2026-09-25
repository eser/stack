# Go Language Conventions

Day-to-day Go idioms this repository settles on: scoping, iteration, strings,
types, parameters, enums, resources, iterators, regexp and JSON.

## Contents

- Shared State Synchronization
- Scope Variables to the `if`
- Prefer `range` for Iteration
- Strings: Conversion, Formatting and Building
- Types: Narrow Conversions and Generics
- Value vs Pointer Parameters
- Enums
- Release Resources Right After Acquiring
- Iterators and Streaming
- Regular Expressions
- JSON Encoding
- Use the Current Standard Library

---

## Shared State Synchronization

Scope: Go code with goroutines (daemon sessions, workers, caches)

Rule: State that more than one goroutine reads or writes is guarded by a
`sync.Mutex`/`sync.RWMutex`, owned by a single goroutine behind a channel, or
held in `sync/atomic` types. Document which one guards each field. Passing
`go test -race` is required, but it does not prove the absence of races on paths
the tests do not run.

Correct:

```go
type registry struct {
    mu       sync.RWMutex
    sessions map[string]*Session // guarded by mu
}
```

Incorrect:

```go
type registry struct {
    sessions map[string]*Session // written by the accept loop and every worker
}
```

---

## Scope Variables to the `if`

Scope: All Go code

Rule: When a value is only needed for one check, declare it in the `if`
statement itself (`if err := os.MkdirAll(dir, 0o750); err != nil {`), so it
cannot be reused by mistake further down. Declare it outside only when the code
after the check uses it.

---

## Prefer `range` for Iteration

Scope: All Go code

Rule: Iterate with `range` rather than an index loop, and use `for i := range n`
(Go 1.22+) for plain counting. Reach for a three-part `for` only when the index
arithmetic is the point, such as stepping by two or walking backwards.

---

## Strings: Conversion, Formatting and Building

Scope: All Go code

Rule:

- One value to or from a string: `strconv`, not `fmt.Sprintf("%d", n)`.
- A host and port: `net.JoinHostPort`, which brackets IPv6; never
  `fmt.Sprintf("%s:%d", ...)`.
- A user-supplied string in an error or log: `%q`, so empty values, spaces and
  control characters are visible (`session ""` instead of a bare gap).
- A string built in a loop: `strings.Builder`.
- Bytes that are mutated or moved through I/O stay `[]byte`; convert to `string`
  once at the boundary, not per call.

Correct:

```go
port := strconv.Itoa(cfg.Port)
addr := net.JoinHostPort(cfg.Host, port) // brackets IPv6: [::1]:8080
label := fmt.Sprintf("%s (%d sessions)", name, count)

if !ValidSessionID(id) {
    return fmt.Errorf("session %q: %w", id, ErrInvalidSessionID)
}

var b strings.Builder
for _, s := range sessions {
    b.WriteString(s.ID)
    b.WriteByte('\n')
}
```

Incorrect:

```go
port := fmt.Sprintf("%d", cfg.Port) // strconv.Itoa is the direct tool

return fmt.Errorf("session %s: %w", id, ErrInvalidSessionID) // "" is invisible

var out string
for _, s := range sessions {
    out += s.ID + "\n" // copies the whole string every iteration
}
```

---

## Types: Narrow Conversions and Generics

Scope: All Go code

Rule: Keep values in the narrowest type that fits and convert explicitly.

- A type assertion uses the two-value form (`v, ok := x.(T)`) unless a failure
  is a programming error that should panic.
- A conversion to a smaller integer type checks the range first; `int32(n)`
  silently wraps on overflow.
- When a function works on several concrete types, write it with a type
  parameter and a constraint, not with `any`. The compiler then checks every
  call and the caller gets its own type back without an assertion. Use `any`
  only for values whose type is truly open, such as decoded JSON.
- Check `slices`, `maps` and `cmp` before writing a helper.

Correct:

```go
type identified interface{ GetID() string }

func findByID[T identified](items []T, id string) (T, bool) {
    for _, item := range items {
        if item.GetID() == id {
            return item, true
        }
    }
    var zero T
    return zero, false
}

session, ok := findByID(sessions, sessionID) // session is a Session

if n > math.MaxInt32 || n < math.MinInt32 {
    return fmt.Errorf("timeout %d does not fit in int32", n)
}
timeout := int32(n)
```

Incorrect:

```go
func findByID(items []any, id string) any { /* ... */ }

session := findByID(toAny(sessions), sessionID).(Session) // panics on a mismatch

timeout := int32(n) // wraps silently
```

---

## Value vs Pointer Parameters

Scope: Function parameters in Go (method receivers are a separate decision)

Rule: Pass by value by default, and take a pointer only for a reason the
signature should communicate. A pointer parameter tells the reader that the
function may change the value or that nil is a valid input; using one without
that reason sends the wrong signal.

Take a pointer when:

- the function mutates the caller's value;
- nil means something (an optional field in a partial update);
- the type must not be copied: it contains a `sync.Mutex`, `sync.WaitGroup` or
  similar (`go vet` reports these as copylocks), or its methods use pointer
  receivers;
- the struct is 80 bytes or more, the threshold `hugeParam` enforces below.

Pass by value when:

- the type is a scalar or a small value type: `string`, `int`, `bool`,
  `float64`, `time.Time`, `time.Duration`. A string is already a pointer and a
  length, so `*string` only adds a nil case;
- the type is already a header over shared data: slice, map, channel, function
  or interface. A pointer to them is needed only to replace the header itself,
  and returning the new value is usually clearer;
- the function only reads a small struct.

`golangci-lint` enforces the size case: gocritic's `hugeParam` check flags value
parameters and receivers of 80 bytes or more. Code written before the check was
enabled carries `//nolint:gocritic // hugeParam: <reason>` on the flagged line.
New code either takes a pointer or adds the same comment with a real reason (a
copy on purpose, an interface or library signature it must match).

Do not reach for a pointer "to save memory". Copying a small struct is cheap and
stays on the stack, while taking the address of a local value can make it escape
to the heap, which costs an allocation and GC work. Each dereference is also a
possible cache miss. For small read-only structs a value is usually faster; for
large structs or mutation a pointer wins. When the difference matters, measure
it (`go test -bench`, `go build -gcflags=-m` for escapes) as coding-practices:
Performance Claims Need Measurement requires.

Correct:

```go
// Small value types by value
func FormatSessionLine(id, phase string, lastActive time.Time) string

// Pointer because the function fills in the caller's config
func ApplyDefaults(cfg *Config)

// Pointer because nil means "leave the phase unchanged"
func UpdateSession(ctx context.Context, id string, phase *string) error

// Pointer because Registry holds a sync.RWMutex and must not be copied
func ListStale(reg *Registry, now time.Time) []string

// Slice by value: it is already a header over shared data
func CountActive(sessions []Session) int
```

Incorrect:

```go
func DescribeSession(id *string) string // no mutation, nil is not meaningful

func CountActive(sessions *[]Session) int // pointer to a slice header

func ListStale(reg Registry, now time.Time) []string // copies the mutex
```

---

## Enums

Scope: `iota` constants

Rule: The zero value of a Go variable silently becomes the first enum member.
Start the enum at 1, or make 0 an explicit `Unknown`/`Unspecified` member, so an
unset value is detectable. Keep 0 as a real member only when it is the correct
default, and say so in a comment. Give the type a `String()` method, and switch
over it exhaustively (coding-practices: Exhaustive Branching).

Correct:

```go
type Phase int

const (
    PhaseUnknown Phase = iota // zero value: not set
    PhaseDiscovery
    PhaseExecuting
    PhaseCompleted
)

type CircuitState int

const (
    StateClosed CircuitState = iota // zero value on purpose: a new breaker is closed
    StateOpen
    StateHalfOpen
)
```

Incorrect:

```go
const (
    PhaseDiscovery Phase = iota // an unset Phase reads as Discovery
    PhaseExecuting
)
```

---

## Release Resources Right After Acquiring

Scope: Files, response bodies, rows, locks, tickers, listeners

Rule: Put `defer x.Close()` (or `Unlock`, `Stop`, `cancel`) on the line right
after a successful open, before any other code. A later edit that adds an early
return cannot skip it. For a writer, the error from `Close` or `Flush` can mean
lost data: return it instead of dropping it. Use `runtime.AddCleanup` rather
than `runtime.SetFinalizer` for the rare object whose cleanup the GC must
trigger. The general rule is coding-practices: Release Resources Where They Are
Acquired.

Correct:

```go
f, err := os.Open(path)
if err != nil {
    return fmt.Errorf("open %s: %w", path, err)
}
defer f.Close()

func writeSummary(path string, s Summary) (err error) {
    f, err := os.Create(path)
    if err != nil {
        return fmt.Errorf("create %s: %w", path, err)
    }
    defer func() {
        if cerr := f.Close(); cerr != nil && err == nil {
            err = fmt.Errorf("close %s: %w", path, cerr)
        }
    }()
    return json.NewEncoder(f).Encode(s)
}
```

Incorrect:

```go
f, _ := os.Open(path)
data := parse(f) // an early return added here later leaks f
f.Close()
```

---

## Iterators and Streaming

Scope: Code that walks large or unbounded data

Rule: Produce and consume large sequences lazily. Return an `iter.Seq`/
`iter.Seq2` (Go 1.23+) instead of a fully built slice when a caller may stop
early or the data is large, and move bulk data with streams (`io.Copy`,
`bufio.Scanner`, `rows.Next`) instead of reading it all into memory. Memory then
stays constant however large the input grows. The general rule is
coding-practices: Stream Large Data.

Correct:

```go
func (l *Ledger) Entries() iter.Seq2[Entry, error] {
    return func(yield func(Entry, error) bool) {
        scanner := bufio.NewScanner(l.file)
        for scanner.Scan() {
            entry, err := decodeEntry(scanner.Bytes())
            if !yield(entry, err) {
                return
            }
        }
        if err := scanner.Err(); err != nil {
            yield(Entry{}, err)
        }
    }
}
```

Incorrect:

```go
data, err := os.ReadFile(ledgerPath) // loads the whole ledger to read the last entry
```

---

## Regular Expressions

Scope: All Go code using `regexp`

Rule: Compile a constant pattern once, in a package-level variable with
`regexp.MustCompile`; a panic there is a bug found at start-up, not an expected
error. Compile a pattern built from input with `regexp.Compile` and handle the
error. Never compile inside a loop or a hot function. The same holds for
`text/template` and `html/template`: parse once, at start-up or in a
`sync.OnceValues`, and execute many times.

Correct:

```go
var sessionIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)
```

Incorrect:

```go
func valid(id string) bool {
    return regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`).MatchString(id) // compiles every call
}
```

---

## JSON Encoding

Scope: All Go JSON operations

Rule: Use `encoding/json`. `encoding/json/v2` needs `GOEXPERIMENT=jsonv2` on the
Go 1.26 toolchain this module targets and does not build without it, and the
repository does not set that experiment. Use the `omitzero` tag (Go 1.24+) for
fields whose zero value should be left out, including `time.Time` and structs,
where `omitempty` does nothing. Stream large payloads with `json.NewDecoder`
instead of reading them into memory first. Moving to v2 is part of raising the
`go` directive, see [modernization.md](modernization.md).

Correct:

```go
type Session struct {
    ID           string    `json:"id"`
    LastActiveAt time.Time `json:"lastActiveAt,omitzero"`
}
```

Incorrect:

```go
import "encoding/json/v2" // does not build without GOEXPERIMENT=jsonv2

type Session struct {
    LastActiveAt time.Time `json:"lastActiveAt,omitempty"` // zero time is still written
}
```

---

## Use the Current Standard Library

Scope: All Go code

Rule: Use the standard library feature that replaced an older idiom or a
third-party package, up to the Go version in the module's `go` directive
(`go 1.26` here), and nothing newer. The replacement table, the JSON note and
the upgrade procedure are in [modernization.md](modernization.md). Run
`go fix ./...` to apply the automatic rewrites.
