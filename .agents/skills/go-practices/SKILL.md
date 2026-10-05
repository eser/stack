---
name: go-practices
description: "Go conventions of this codebase, built on the ajan fx packages (logfx, httpfx, connfx, processfx): hexagonal layout, constructor injection, errors with errors.AsType, logfx logging, context, table-driven tests, idioms, data structures, performance, the Go 1.26 standard library. Use when writing or reviewing .go files, Go services or tests, benchmarks or profiling, or golangci-lint findings."
---

# Go Practices

How Go services and libraries are written in this codebase: hexagonal layers,
dependencies through constructors, and the ajan `fx` packages as the building
blocks for logging, HTTP, connections, processes and configuration. This
codebase's module layout and commands are in its `AGENTS.md`.

## Always

- Business packages (`business/<domain>/`) import only the standard library; all
  wiring happens in one composition root (`adapters/appcontext/`).
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
- `./...` never crosses a module boundary: when this codebase has several Go
  modules, check, lint and test each one in its own directory.

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
coding-practices and design-principles; commands in this codebase's AGENTS.md.
