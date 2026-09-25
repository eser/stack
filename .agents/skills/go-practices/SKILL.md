---
name: go-practices
description: "Go conventions for eserstack's ajan framework, services and FFI bridge. Covers package layout, hexagonal wiring, errors and logfx logging, context, tests, idioms, data structures, performance and Go 1.26 stdlib use. Use when writing or reviewing .go files, pkg/ajan packages, pkg/@eserstack/ajan, Go tests, benchmarks, profiling or allocation work, or fixing golangci-lint findings."
---

# Go Practices

How Go code is written in this repository: one root module
`github.com/eser/stack` (framework in `pkg/ajan/`, binary in
`cmd/noskills-server/`) plus the FFI bridge module `github.com/eser/ajan` in
`pkg/@eserstack/ajan/`.

## Always

- Business packages under `pkg/ajan/api/business/` import only the standard
  library; wiring happens in `pkg/ajan/api/adapters/appcontext/appcontext.go`.
- Files are snake_case.
- Check every error and wrap with a context prefix:
  `fmt.Errorf("load session %q: %w", id, err)`. Lowercase messages, `%q` for
  user input, `errors.Is` and `errors.AsType`, handle each error once.
- Log and trace through `logfx` with the `*Context` methods; never `fmt.Println`
  or `log.Printf`.
- `ctx context.Context` first; pass the caller's context down and cancel every
  context you derive.
- Pass by value unless the function mutates, nil means something, the type must
  not be copied, or it is 80+ bytes (gocritic `hugeParam`).
- Dependencies arrive through constructors: no globals, no service locator, no
  `init()`; functional options that validate; enums start at an Unknown.
- `defer Close()` on the line after a successful open; `panic` only for bugs.
- Use the standard library up to the `go 1.26` directive, nothing newer.
- Tests are table-driven with `t.Parallel()` and run with `-race`.
- `make ok` checks only the root module. `deno task cli ok` also vets, builds
  and lints the bridge module, since `./...` never crosses a module boundary.

## References

| File                                                      | Read when                                                            |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| [architecture.md](references/architecture.md)             | Adding a package or domain, dependency injection, constructors       |
| [errors-and-logging.md](references/errors-and-logging.md) | Returning or matching errors, logging, spans, metrics                |
| [context.md](references/context.md)                       | Passing, deriving or detaching a context; handlers; outbound calls   |
| [language.md](references/language.md)                     | Strings, types, generics, parameters, enums, iterators, JSON, regexp |
| [testing.md](references/testing.md)                       | Writing Go tests, fakes for ports, or benchmarks                     |
| [data-structures.md](references/data-structures.md)       | Choosing slices, maps, containers, buffers or generic types          |
| [performance.md](references/performance.md)               | Profiling, benchmarks, allocations, caching, I/O and batching        |
| [modernization.md](references/modernization.md)           | Replacing an old idiom, raising the `go` directive, Go tooling       |

General rules (errors, logging, timeouts, config, interfaces) live in
coding-practices and design-principles; commands in AGENTS.md.
