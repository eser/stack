---
name: go-practices
description: Go conventions for hexagonal architecture, project structure, error handling, testing, and observability. Use when writing Go services.
---

# go-practices

## Quick Start

1. Follow hexagonal architecture: business logic in `pkg/api/business/`,
   adapters in `pkg/api/adapters/`
2. Use snake_case for all Go files
3. Wrap errors: `fmt.Errorf("%w: %w", ErrSentinelError, err)`
4. Run tests with race detection: `go test -race ./...`

## Key Principles

- Business logic has NO external dependencies
- All external interactions through interfaces
- Composition via AppContext (composition root)
- Table-driven tests with `t.Parallel()`
- OpenTelemetry for observability

## References

See [rules.md](references/rules.md) for complete conventions.
