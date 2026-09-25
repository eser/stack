---
name: coding-practices
description: "Language-neutral code quality rules for eserstack, TypeScript and Go. Covers errors, logging, explicit checks, naming and comments, timeouts and resource bounds, streaming, background work, input and config sources, and performance claims. Use when writing or reviewing code, handling errors, adding logs or calling external services. Not for syntax (use javascript-practices or go-practices)."
---

# Coding Practices

Rules that hold in every language in this repository. Language syntax lives in
javascript-practices and go-practices; design patterns in design-principles.

## Always

- Handle every failure that can happen; catch narrowly and let the rest
  propagate. No handling for states the types rule out.
- An error is handled or returned, never both: return with context, log once
  where it is handled.
- Messages name the operation, the value that failed and the fix. "failed",
  "invalid" and "Something went wrong" are defects.
- Log through `@eserstack/logging` or `logfx` with ids attached, never
  `console.*` (lint: `no-console`).
- Implicit truthy/falsy checks only on booleans; `??` for defaults, never `||`.
- Compare entities by id, never by slug, name or email.
- Every external call has a timeout, every pool, queue and cache a limit, and
  every started promise or goroutine an owner.
- Release resources in the scope that acquired them (`defer`, `finally`).
- No absolute paths or machine-specific values; paths come from
  `import.meta.dirname` or a caller-supplied root.
- Configuration precedence: environment, then config file, then default.
- Performance changes come with before and after measurements.

## References

| File                                                    | Read when                                                                                |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [errors.md](references/errors.md)                       | Raising, wrapping, matching or reporting errors; `Result` types                          |
| [logging.md](references/logging.md)                     | Adding or reviewing log calls, levels and context fields                                 |
| [readability.md](references/readability.md)             | Naming, comments, abstraction, checks, switches, early returns, line breaks              |
| [resources-and-io.md](references/resources-and-io.md)   | Network calls, subprocesses, retries, limits, cleanup, streaming, async work, benchmarks |
| [inputs-and-config.md](references/inputs-and-config.md) | Parsing input, resolving paths, loading configuration                                    |
