# context.Context

`context.Context` carries cancellation, deadlines and request-scoped values
through a unit of work: one HTTP request, one daemon RPC, one CLI command. Every
operation that belongs to that unit receives the same context, so when the
caller gives up, everything it started stops. The general principle is
design-principles: Cancellation Flows With the Work; this file is its Go form.

## Contents

- Summary
- Cancellation
- Listening for Cancellation
- HTTP Handlers
- Outbound Calls and Databases
- Context Values
- Trace Propagation

---

## Summary

1. Pass the caller's context through the whole chain: handler, service,
   repository, outbound client. A link that starts a fresh context keeps working
   after the client has gone.
2. `ctx context.Context` is the first parameter. Do not store it in a struct: a
   struct outlives the request that filled it.
3. Never pass `nil`; use `context.TODO()` where the caller has no context yet,
   which marks the gap to fix.
4. Call the `cancel` of every derived context on every path, normally with
   `defer cancel()` on the next line (`go vet` reports `lostcancel`).
5. `context.Background()` only at entry points: `main`, the composition root,
   and tests through `t.Context()`.
6. Context values carry request-scoped metadata under unexported key types,
   never business parameters.
7. Work that must outlive the request uses `context.WithoutCancel` plus its own
   timeout.

---

## Cancellation

For a group of goroutines, `errgroup.WithContext` gives each one the same
derived context and cancels it on the first error, which also satisfies
coding-practices: Owned Asynchronous Work.

```go
func (s *SyncService) SyncAll(ctx context.Context, projects []Project) error {
    g, ctx := errgroup.WithContext(ctx)
    g.SetLimit(4) // bound concurrency against the remote

    for _, p := range projects {
        g.Go(func() error { return s.syncOne(ctx, p) })
    }

    if err := g.Wait(); err != nil {
        return fmt.Errorf("sync projects: %w", err)
    }
    return nil
}
```

---

## Listening for Cancellation

A loop that waits on channels selects on `ctx.Done()` and returns `ctx.Err()`. A
CPU-bound loop checks `ctx.Err()` between items and says how far it got
(`stopped after %d of %d files: %w`). A timeout set low in the chain is only a
ceiling: a child context never outlives its parent's deadline. For cleanup when
the context ends, use `context.AfterFunc` and call the returned `stop` when it
is no longer needed.

---

## HTTP Handlers

An `httpfx` handler reads the request context from `ctx.Request.Context()`; it
ends when the client disconnects or the handler returns. Handlers never create
`context.Background()`. When the work failed because the client left, there is
nobody to answer, so do not log it as a server error.

Work that must finish after the response (an audit entry, a notification) uses
`context.WithoutCancel`, which keeps the trace and request ids and drops the
cancellation and the deadline. Give it its own timeout and run it through an
owner that reports failures instead of a bare `go` (coding-practices: Owned
Asynchronous Work):

```go
func (h *SpecHandler) Create(ctx *httpfx.Context) httpfx.Result {
    reqCtx := ctx.Request.Context()

    spec, err := h.specs.Create(reqCtx, readSpecRequest(ctx))
    if err != nil {
        if reqCtx.Err() != nil {
            return ctx.Results.Abort() // client gone; no response to write
        }
        return h.errorResult(ctx, err)
    }

    // The audit entry must be written even if the client disconnects now.
    h.background.Run("audit spec created", func() error {
        auditCtx, cancel := context.WithTimeout(context.WithoutCancel(reqCtx), 10*time.Second)
        defer cancel()
        return h.audit.SpecCreated(auditCtx, spec)
    })

    return ctx.Results.JSON(spec)
}
```

`context.Background()` for the audit would lose the trace id; `reqCtx` alone
would cancel the write as soon as the handler returns.

---

## Outbound Calls and Databases

Every call that leaves the process takes the context, so a disconnect cancels
the whole downstream chain and the call is bounded (coding-practices: External
Calls Have Timeouts).

- HTTP: `http.NewRequestWithContext(ctx, ...)`, never `http.NewRequest` or
  `http.Get`.
- `database/sql`: the `*Context` variants (`QueryContext`, `ExecContext`,
  `QueryRowContext`). pgx methods take `ctx` first already.
- Subprocesses: `exec.CommandContext(ctx, ...)`.

Correct:

```go
func (c *RegistryClient) FetchIndex(ctx context.Context) (*Index, error) {
    req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/index.json", nil)
    if err != nil {
        return nil, fmt.Errorf("build index request: %w", err)
    }

    resp, err := c.http.Do(req)
    if err != nil {
        return nil, fmt.Errorf("fetch index: %w", err)
    }
    defer resp.Body.Close()

    return decodeIndex(resp.Body)
}
```

Incorrect:

```go
resp, err := http.Get(c.baseURL + "/index.json") // ignores cancellation and deadline
row := db.QueryRow("SELECT ...", id)            // same for the query
```

---

## Context Values

Context values carry request-scoped metadata that crosses API boundaries:
request and correlation ids, the authenticated principal, trace state. Keys are
an unexported type, and the package that owns a key exposes typed accessors:

```go
type contextKey int

const requestIDKey contextKey = iota

func WithRequestID(ctx context.Context, id string) context.Context {
    return context.WithValue(ctx, requestIDKey, id)
}

func RequestIDFrom(ctx context.Context) (string, bool) {
    id, ok := ctx.Value(requestIDKey).(string)
    return id, ok
}
```

Incorrect:

```go
ctx = context.WithValue(ctx, "request_id", id) // any package can collide with "request_id"
```

| Data                                    | Context value?                             |
| --------------------------------------- | ------------------------------------------ |
| Request, correlation, trace, span ids   | Yes                                        |
| Authenticated principal or tenant       | Yes                                        |
| Database pool, HTTP client, stores      | No: inject through the composition root    |
| Configuration and feature flags         | No: pass explicitly or inject              |
| Business inputs (session id, spec data) | No: function parameters                    |
| Logger                                  | Only a logger enriched with request fields |

---

## Trace Propagation

Trace state crosses service boundaries in the context. Use `logfx`'s propagator
(`logger.PropagatorExtract` in, `logger.PropagatorInject` out, W3C
`traceparent`) as errors-and-logging.md: Tracing and Metrics describes, instead
of copying ids into custom headers by hand. A request id that is not part of the
trace follows the context-value pattern above: read it in middleware, store it
with a typed accessor, and write it on outbound requests.
