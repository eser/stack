# Go Architecture and Package Structure

Where Go code lives in this repository, how it is wired, and how packages are
constructed. The principle is architecture-guidelines: Hexagonal Architecture
(Double-Layered); this file is its Go form.

## Contents

- Repository Layout
- Hexagonal Layers in Go
- Dependency Injection
- Adding a Business Domain
- File Naming
- Constructors and Options
- No `init()`
- Compile-Time Interface Checks
- Embedded Assets

---

## Repository Layout

Scope: All Go code

Rule: The repository is one Go module, `github.com/eser/stack`, with `go.mod`,
`Makefile` and `.golangci.yaml` at the root. The cgo and WASI FFI bridge in
`pkg/@eserstack/ajan/` is a second module, `github.com/eser/ajan`, with its own
`go.mod`. There is deliberately no `go.work`; `deno task cli ok` checks each
module in its own directory.

| Path                                | Holds                                               |
| ----------------------------------- | --------------------------------------------------- |
| `pkg/ajan/<name>fx/`                | Framework packages (`logfx`, `httpfx`, `connfx`)    |
| `pkg/ajan/api/business/<domain>/`   | Business logic and its ports                        |
| `pkg/ajan/api/adapters/`            | Adapters that implement the ports                   |
| `pkg/ajan/api/adapters/appcontext/` | The composition root (`appcontext.go`)              |
| `cmd/noskills-server/`              | The server binary's entry point                     |
| `pkg/@eserstack/ajan/`              | The FFI and WASM bridge consumed by the TS packages |

Do not create `internal/`, `configs/` or `test/` trees. Framework packages are
imported from `pkg/ajan/`, never copied into a service.

---

## Hexagonal Layers in Go

Scope: Business logic and adapters under `pkg/ajan/api/`

Rule:

- A business package imports only the standard library and other business
  packages. It defines its ports as interfaces next to the code that uses them.
- Adapters implement those ports with concrete dependencies (pgx, HTTP, Redis,
  LLM providers).
- All wiring happens in the composition root,
  `pkg/ajan/api/adapters/appcontext/appcontext.go`: it loads config, builds the
  logger, creates adapters and hands them to business services.

Correct:

```go
// pkg/ajan/api/business/sessions/service.go
package sessions

type Store interface { // port, owned by the business package
    Get(ctx context.Context, id string) (*Session, error)
}

type Service struct {
    store Store
}

func NewService(store Store) *Service {
    return &Service{store: store}
}
```

Incorrect:

```go
package sessions

import "github.com/jackc/pgx/v5/pgxpool" // business code bound to a driver

type Service struct {
    pool *pgxpool.Pool
}
```

---

## Dependency Injection

Scope: Services, adapters and the composition root

Rule: A type receives everything it depends on through its constructor. The
constructor stores what it is given and returns a concrete type (a `*Service`,
not an interface); the parameters are the consumer's own port interfaces
(Hexagonal Layers in Go).

- No hidden dependencies: a constructor does not open connections, read the
  environment or reach for a package-level variable. What it needs is a
  parameter, so the signature is the whole dependency list.
- No global registries or service locators. The composition root
  (`appcontext.go`) is the only code that knows every service; it is never
  passed on, and no service looks another one up by name.
- Stateful resources (the pgx pool, HTTP clients, caches, the logger) are
  created once in the composition root and shared. Stateless helpers are plain
  values or functions.
- Build everything at start-up, so a bad config or an unreachable dependency
  fails before the process takes traffic. Defer creation (`sync.OnceValues`)
  only for an optional adapter that is expensive and often unused, and say so in
  a comment.
- Keep the graph shallow: a service depends on ports and config, not on a chain
  of other services. A constructor with many parameters or a long chain is a
  sign that the service does too much; split it before adding a container.
- Wiring stays manual. A DI container or code generator is a new dependency and
  an architecture change: it needs tooling-standards: Adding a Dependency and an
  ADR first.

Correct:

```go
// pkg/ajan/api/business/sessions/service.go
// Business code stays on the standard library: *slog.Logger, not *logfx.Logger.
func NewService(store Store, clock func() time.Time, logger *slog.Logger) *Service {
    return &Service{store: store, clock: clock, logger: logger}
}

// pkg/ajan/api/adapters/appcontext/appcontext.go
// Connections come from the connfx registry, loaded from cfg.Conn.
conn, ok := connRegistry.GetNamed("sessions").(*connfx.PgxConnection)
if !ok {
    return nil, fmt.Errorf("%w (name=%q)", ErrSessionsConnectionMissing, "sessions")
}
store := postgres.NewSessionStore(conn.GetPool())
sessionSvc := sessions.NewService(store, time.Now, logger.Logger) // logfx embeds *slog.Logger
```

Incorrect:

```go
func NewService() *Service {
    pool, _ := pgxpool.New(context.Background(), os.Getenv("DATABASE_URL")) // hidden, unchecked
    return &Service{pool: pool}
}

func (s *Service) notify(ctx context.Context, id string) error {
    mailer := registry.Get("mailer").(Mailer) // service locator
    return mailer.Send(ctx, id)
}
```

**Why:** when every dependency is a constructor parameter, a test swaps any of
them for a fake, the wiring order is checked by the compiler, and a reader sees
what a service touches without reading its body.

---

## Adding a Business Domain

Scope: New business logic in the Go services

Rule:

1. Create `pkg/ajan/api/business/<domain>/`.
2. Define ports (interfaces) for everything the domain needs from outside.
3. Write the logic against those ports, importing only the standard library.
4. Implement the ports in `pkg/ajan/api/adapters/<adapter>/`.
5. Wire them in `pkg/ajan/api/adapters/appcontext/appcontext.go`.
6. Validate with `deno task cli go-ok` (runs `make ok` on the root module).

---

## File Naming

Scope: Go files

Rule: Go files are snake_case (`session_store.go`, `http_service.go`,
`logfx_coverage_test.go`). The repository validator enforces kebab-case
elsewhere and snake_case under `cmd/`, `pkg/ajan/` and `pkg/@eserstack/ajan/`.

---

## Constructors and Options

Scope: Constructors and functions with optional settings

Rule: Give a constructor of a long-lived type (a client, a server, a pool)
functional options when it has several optional settings: one `With...` function
per setting, applied over safe defaults. New options then never break existing
callers. An option that can be invalid returns an error, and the constructor
reports it, so bad configuration fails at construction instead of at first use.
Settings loaded from config use a `Config` struct with `conf` tags instead (as
`httpclient.Config` does); a single call with many parameters takes an options
struct (coding-practices: Line Length and Breaking).

Correct:

```go
type Option func(*Client) error

func WithTimeout(d time.Duration) Option {
    return func(c *Client) error {
        if d <= 0 {
            return fmt.Errorf("timeout %s must be positive", d)
        }
        c.timeout = d
        return nil
    }
}

func NewClient(baseURL string, opts ...Option) (*Client, error) {
    c := &Client{baseURL: baseURL, timeout: 10 * time.Second}
    for _, opt := range opts {
        if err := opt(c); err != nil {
            return nil, fmt.Errorf("new client: %w", err)
        }
    }
    return c, nil
}
```

Incorrect:

```go
func NewClient(baseURL string, timeout time.Duration, retries int, verbose bool) *Client
// every new setting changes the signature; a bad timeout surfaces later
```

---

## No `init()`

Scope: All Go code

Rule: Do not use `init()`. It runs implicitly at import time, cannot return an
error, and runs in every test that imports the package. Do the work in an
explicit constructor or setup function that the composition root calls and whose
error it handles. A package-level `var` with a constant value (a compiled
constant regexp, a lookup table) is fine; see design-principles: Module-Level
Side Effects.

---

## Compile-Time Interface Checks

Scope: Types that must satisfy an interface they are not passed as directly

Rule: Assert the relationship next to the type, so a changed method signature
fails the build in the implementing package instead of at a distant call site:
`var _ ConfigLoader = (*ConfigManager)(nil)` (`configfx/manager.go`).

---

## Embedded Assets

Scope: Templates, schemas, default configs and other files a binary ships with

Rule: Embed static files with `//go:embed` (as `noskillsserverfx/docs_embed.go`
does) instead of reading them from disk at runtime. The path then cannot be
wrong on another machine, and a missing file is a build error.
