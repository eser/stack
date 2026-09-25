---
name: architecture-guidelines
description: "System design in eserstack: double-layered hexagonal architecture, explicit adapter composition, public API and CLI surface, request metadata, testing strategy, ADRs. Use when designing a package or service, adding options or flags, planning tests or writing an ADR. Not for file naming (use tooling-standards)."
---

# Architecture Guidelines

How packages and services are structured, composed, tested and documented as
decisions.

## Always

- Domain logic and its port types live together in `domain/`; adapters live in
  `adapters/`. No `ports/` directory.
- Callers import adapters explicitly and pass them in. No string-selected
  adapters, no convenience factories, no dynamic imports inside a package.
- Library code reaches the runtime through `@eserstack/standards/cross-runtime`,
  never `Deno.*`.
- Every option has a safe default; add an option only for a named case; no
  positional booleans.
- Request ids and trace state travel in the request context, never as extra
  parameters.
- Unit tests with fakes for logic, integration tests for adapters; failure paths
  tested; coverage never drops.
- Validator and codebase-tool design lives in
  `pkg/@eserstack/codebase/AGENTS.md`
- A lasting architectural decision gets an ADR in `docs/adr/`.

## References

| File                                                              | Read when                                                                   |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [hexagonal-architecture.md](references/hexagonal-architecture.md) | Structuring a package, adding an adapter, adding options, flags or env vars |
| [testing.md](references/testing.md)                               | Deciding what and how to test, choosing the runner, coverage                |
| [adrs.md](references/adrs.md)                                     | Recording an architectural decision                                         |
