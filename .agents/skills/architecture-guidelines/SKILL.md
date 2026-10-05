---
name: architecture-guidelines
description: "Design conventions of this codebase for TypeScript and Go packages and services: double-layered hexagonal architecture, explicit adapter composition, runtime access as an adapter, public API and CLI surface, request metadata, testing strategy, ADRs. Use when designing a package or service, adding options or flags, planning tests or writing an ADR. Not for file naming (use tooling-standards)."
---

# Architecture Guidelines

How packages and services in this codebase are structured, composed, tested and
documented as decisions.

## Always

- Domain logic and its port types live together in `domain/`; adapters live in
  `adapters/`. No `ports/` directory.
- Callers import adapters explicitly and pass them in. No string-selected
  adapters, no convenience factories, no dynamic imports inside a package.
- Library code reaches the runtime through an adapter
  (`@eserstack/standards/cross-runtime`), never `Deno.*` directly.
- Every option has a safe default; add an option only for a named case; no
  positional booleans.
- Request ids and trace state travel in the request context, never as extra
  parameters.
- Unit tests with fakes for logic, integration tests for adapters; failure paths
  tested; coverage never drops.
- A lasting architectural decision gets an ADR, written with the change.

## References

| File                                                              | Read when                                                                   |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [hexagonal-architecture.md](references/hexagonal-architecture.md) | Structuring a package, adding an adapter, adding options, flags or env vars |
| [testing.md](references/testing.md)                               | Deciding what and how to test, choosing the runner, coverage                |
| [adrs.md](references/adrs.md)                                     | Recording an architectural decision                                         |
