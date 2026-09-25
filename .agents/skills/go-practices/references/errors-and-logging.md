# Go Errors, Logging and Tracing

How Go code in this repository returns errors, logs through `logfx`, and records
spans. The general rules are in coding-practices (Error Wrapping, Handle Each
Error Once, Structured Logging); this file is their Go form.

## Contents

- Error Handling
- Logging Conventions
- Tracing and Metrics

---

## Error Handling

Scope: All Go code

Rule:

- Check every returned error; never discard one with `_`.
- Wrap with a context prefix and `%w` inside the module
  (`fmt.Errorf("load session %q: %w", id, err)`), so callers can match the
  cause. At a system boundary (a public API whose internals callers must not
  depend on, a response to another service or a user) use `%v` or translate the
  error, so the chain does not leak implementation details.
- Error strings are lowercase and have no trailing punctuation, because they are
  joined into longer messages (`load session: open file: no such file`). This
  applies to error values, not to text shown to users. Quote user-supplied
  strings with `%q`, so an empty or odd value stays visible.
- Use a sentinel error (`var ErrSessionNotFound = errors.New(...)`) for an
  expected condition callers branch on, and a custom error type when the error
  carries data. Define both in the business package. When a caller must match a
  sentinel and also needs the cause, join them:
  `fmt.Errorf("%w: %w", ErrSessionNotFound, err)`.
- Match with `errors.Is` for sentinels and `errors.AsType[T](err)` (Go 1.26+)
  for types. Never compare with `==` or use a bare type assertion on a wrapped
  error.
- Combine independent failures (cleanup after an error, a batch) with
  `errors.Join`.
- Return an error for anything a caller can expect or handle (bad input, missing
  file, network failure). `panic` is only for a bug that should never happen,
  such as an impossible state or a `Must*` helper on a constant.

Correct:

```go
var ErrSessionNotFound = errors.New("session not found")

type ValidationError struct {
    Field string
    Value string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("invalid %s %q", e.Field, e.Value)
}

func (s *SessionService) Load(ctx context.Context, id string) (*Session, error) {
    session, err := s.store.Get(ctx, id)
    if err != nil {
        return nil, fmt.Errorf("load session %q: %w", id, err)
    }
    return session, nil
}

if errors.Is(err, ErrSessionNotFound) { /* 404 */ }
if verr, ok := errors.AsType[*ValidationError](err); ok { /* 400 with verr.Field */ }

return errors.Join(saveErr, closeErr)
```

Incorrect:

```go
session, _ := s.store.Get(ctx, id)          // error discarded
return errors.New("Failed to load session.") // capitalized, punctuated, cause lost
if err == ErrSessionNotFound { }             // misses a wrapped sentinel
if verr, ok := err.(*ValidationError); ok {} // misses a wrapped type
```

---

## Logging Conventions

Scope: All logging statements

Rule: Log through `logfx` (`pkg/ajan/logfx`), which wraps `log/slog`, with
key-value pairs or typed `slog` attributes. Never use `fmt.Println`,
`log.Printf` or a third-party logger. Use the `*Context` methods (`InfoContext`,
`WarnContext`, `TraceContext`) so trace and request ids travel with the entry.
`logfx` adds `LevelTrace`, `LevelFatal` and `LevelPanic` around slog's Debug,
Info, Warn and Error.

- HTTP servers log each request once through
  `httpfx/middlewares.TracingMiddleware` (method, path, status, duration);
  handlers do not log the request again.
- An error is logged once, where it is handled (coding-practices: Handle Each
  Error Once).
- What never to log: security-practices: Secrets and Personal Data Never Reach
  Output.
- In hot loops, see performance.md: Logging in Hot Paths.

Correct:

```go
logger.WarnContext(ctx, "session expired", slog.String("session_id", id))
```

Incorrect:

```go
log.Printf("session %s expired", id) // unstructured, no trace id
```

---

## Tracing and Metrics

Scope: Spans and metrics in Go services

Rule: Create spans and metrics through `logfx`, which holds the OpenTelemetry
providers, not through the global `otel` package:

- Spans: `ctx, span := logger.StartSpan(ctx, "LoadSession", slog.String(...))`,
  then `defer span.End()`, and `span.RecordError(err)` on failure. Pass the
  returned `ctx` on, so child spans and log entries join the trace.
- Propagation across services: `logger.PropagatorExtract(ctx, r.Header)` on the
  way in and `logger.PropagatorInject(ctx, req.Header)` on the way out (W3C
  trace context). `TracingMiddleware` already extracts for HTTP servers.
- Metrics: `logger.NewMetricsBuilder("<package>")`, then `Counter`, `Gauge` or
  `Histogram`.
- Attributes carry ids and outcomes, never secrets or personal data.
- Spans live in adapters and handlers, which may import `logfx`. Business
  packages stay on the standard library: they receive the traced `ctx` and a
  `*slog.Logger`, and a business operation that needs its own span takes a small
  tracer port instead of `*logfx.Logger`.

Correct:

```go
// pkg/ajan/api/adapters/postgres/session_store.go
func (s *SessionStore) Get(ctx context.Context, id string) (*sessions.Session, error) {
    ctx, span := s.logger.StartSpan(ctx, "SessionStore.Get", slog.String("session_id", id))
    defer span.End()

    session, err := s.query(ctx, id)
    if err != nil {
        span.RecordError(err)
        return nil, fmt.Errorf("get session %q: %w", id, err)
    }
    return session, nil
}
```
