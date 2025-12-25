# Go Practices - Detailed Rules

## Hexagonal Architecture

Scope: Go projects

Rule: Follow strict hexagonal architecture with clear
separation of concerns.

**Core Layers:**

- **Business Logic** (`pkg/api/business/`) - Pure domain logic with NO external
  dependencies
- **Adapters** (`pkg/api/adapters/`) - External integrations (HTTP, Redis, LLM
  providers)
- **Framework** (`pkg/ajan/`) - Shared infrastructure components
- **Applications** (`cmd/`) - Entry points (serve, cli)

**Key Rules:**

- Business logic ONLY depends on other business logic
- All external interactions through well-defined interfaces
- Ports are interfaces defined within domain/business packages
- Dependency injection via AppContext (composition root)
- All composition happens in composition root
  (`pkg/api/adapters/appcontext/appcontext.go`)

Correct:

```go
// pkg/api/business/user/service.go
package user

type Repository interface {  // Port defined in business layer
    FindByID(ctx context.Context, id string) (*User, error)
}

type Service struct {
    repo Repository  // Depends on interface, not concrete type
}

func NewService(repo Repository) *Service {
    return &Service{repo: repo}
}
```

Incorrect:

```go
// Business logic with external dependency
package user

import "github.com/redis/go-redis/v9"  // Direct external dependency

type Service struct {
    redis *redis.Client  // Concrete type, not interface
}
```

---

## Project Structure

Scope: Go projects

Rule: Follow consistent directory structure. Avoid
`internal/`, `api/`, `configs/`, `test/` directories.

**Standard Structure:**

```
apps/go-project/
├── cmd/                 # Application entrypoints
│   ├── serve/           # HTTP server and workers
│   └── cli/             # Command-line interface
├── docs/                # Project-specific documentation
├── ops/                 # Dockerfiles, Grafana dashboards, k8s configs
└── pkg/                 # Core application logic
    ├── ajan/            # Shared framework (processfx, logfx, etc.)
    └── api/
        ├── adapters/    # External integrations
        └── business/    # Ports and business logic
```

---

## File Naming

Scope: Go files

Rule: Use snake_case for all Go files.

Correct:

```
user_service.go
payment_handler.go
auth_middleware.go
```

Incorrect:

```
UserService.go
paymentHandler.go
auth-middleware.go
```

---

## Error Handling

Scope: All Go code

Rule: Always check and handle errors explicitly. Wrap errors
for traceability.

Correct:

```go
result, err := operation()
if err != nil {
    return fmt.Errorf("%w: %w", ErrOperationFailed, err)
}

// Define sentinel errors in business layer
var ErrUserNotFound = errors.New("user not found")
var ErrInvalidInput = errors.New("invalid input")
```

Incorrect:

```go
result, _ := operation()  // Ignored error

if err != nil {
    return err  // No context added
}

if err != nil {
    return errors.New("failed")  // Original error lost
}
```

---

## Logging Conventions

Scope: All logging statements

Rule: Use appropriate log levels by layer. Never
log sensitive information.

**Layer Guidelines:**

- Repository layer: Only `warn`, `debug`, `trace` levels
- Service layer: Log successful operations at `info` level
- Use structured logging via `pkg/ajan/logfx`
- Include trace IDs and context for correlation

Correct:

```go
// Service layer - info for success
log.Info("user created", "userId", user.ID, "traceId", traceID)

// Repository layer - debug only
log.Debug("fetching user from database", "userId", id)
```

Incorrect:

```go
log.Info("executing query")  // Wrong level for repository
log.Error("password is: " + password)  // Never log secrets
fmt.Println("user created")  // Unstructured logging
```

---

## Testing Requirements

Scope: All Go tests

Rule: Use table-driven tests with parallel execution. Run
with race detection.

Correct:

```go
func TestCalculate(t *testing.T) {
    t.Parallel()

    cases := []struct {
        name     string
        input    int
        expected int
    }{
        {"zero", 0, 0},
        {"positive", 5, 25},
        {"negative", -3, 9},
    }

    for _, tc := range cases {
        tc := tc  // Capture range variable
        t.Run(tc.name, func(t *testing.T) {
            t.Parallel()
            result := Calculate(tc.input)
            if result != tc.expected {
                t.Errorf("got %d, want %d", result, tc.expected)
            }
        })
    }
}
```

Run tests:

```bash
go test -race ./...
```

Incorrect:

```go
func TestCalculate(t *testing.T) {
    // No parallel execution
    // No table-driven pattern
    if Calculate(5) != 25 {
        t.Error("failed")
    }
}
```

---

## OpenTelemetry

Scope: Observability

Rule: Use OpenTelemetry for distributed tracing, metrics,
and structured logging.

**Requirements:**

- Start and propagate spans across service boundaries
- Always attach `context.Context` to spans, logs, metrics
- Record important attributes (request params, user ID, errors)
- Use `otel.Tracer` for tracing spans
- Use `otel.Meter` for collecting metrics

Correct:

```go
func (s *Service) CreateUser(ctx context.Context, req CreateUserRequest) (*User, error) {
    ctx, span := otel.Tracer("user-service").Start(ctx, "CreateUser")
    defer span.End()

    span.SetAttributes(
        attribute.String("user.email", req.Email),
        attribute.String("trace.id", trace.SpanFromContext(ctx).SpanContext().TraceID().String()),
    )

    // ... implementation
}
```

---

## Security & Resilience

Scope: External interactions

Rule: Implement defensive patterns for external
calls.

**Requirements:**

- Rigorous validation and sanitization for all external inputs
- Secure defaults for JWT, cookies, configuration
- Implement retries, exponential backoff, timeouts on external calls
- Use circuit breakers and rate limiting
- Consider distributed rate-limiting with Redis

Correct:

```go
client := &http.Client{
    Timeout: 10 * time.Second,
}

retryPolicy := retry.NewExponential(100 * time.Millisecond)
retryPolicy = retry.WithMaxRetries(3, retryPolicy)
```

---

## Configuration Hierarchy

Scope: Configuration loading

Rule: Load configuration in priority order.

**Priority (highest to lowest):**

1. Environment variables
2. `config.json` file
3. Default values

Correct:

```go
func LoadConfig() Config {
    cfg := defaultConfig()

    if file, err := os.Open("config.json"); err == nil {
        json.NewDecoder(file).Decode(&cfg)
    }

    if val := os.Getenv("API_PORT"); val != "" {
        cfg.Port = val  // Env vars override file
    }

    return cfg
}
```

---

## Code Style

Scope: All Go code

Rule: Write short, focused functions. Prefer composition over
inheritance.

**Guidelines:**

- Single responsibility per function
- Use small, purpose-specific interfaces
- Public functions interact with interfaces, not concrete types
- No redundant wrappers - call methods directly
- Prefer standard library over third-party dependencies

Correct:

```go
type Reader interface {
    Read(p []byte) (n int, err error)
}

func ProcessData(r Reader) error {
    // Works with any Reader implementation
}
```

Incorrect:

```go
type EverythingInterface interface {
    Read() error
    Write() error
    Delete() error
    Update() error
    // Too many methods
}
```

---

## Code Quality Tools

Scope: Go projects

Rule: Use standard linting and quality tools.

**Required Tools:**

- `golangci-lint` - Comprehensive linting (config in `.golangci.yaml`)
- Pre-commit hooks for automated checks
- Conventional commits for commit message validation
- Race detection in tests (`-race` flag)

```bash
golangci-lint run
go test -race ./...
```
