# Go Service Template

Starter template for a new Go service in the eser/stack monorepo.

## Usage

1. Copy this directory to `apps/<service-name>/`
2. Rename `go.mod.tmpl` to `go.mod` and replace `{{SERVICE_NAME}}` with your service name
3. Run `go mod tidy` to initialize dependencies
4. Add your business logic in `pkg/api/business/`
5. Wire dependencies in `pkg/api/adapters/appcontext/appcontext.go`
6. Run `make ok` to validate

## Structure

```
cmd/serve/main.go           — HTTP server entry point
pkg/api/business/            — Pure business logic (no external deps)
pkg/api/adapters/appcontext/ — Composition root (wires everything)
Makefile                     — Build targets (ok, lint, test, build)
```

## Conventions

- Follow hexagonal architecture: business logic has zero external dependencies
- Use `snake_case` for Go file names
- Run tests with race detector: `go test -race ./...`
- See the `go-practices` Claude Code skill for full conventions
