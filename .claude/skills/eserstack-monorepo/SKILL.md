---
name: eserstack-monorepo
description: Monorepo structure, package conventions, version synchronization, and publishing workflow. Use when adding packages, modifying project structure, or managing versions.
---

# eserstack Monorepo

Multi-language monorepo: Deno/TypeScript packages (JSR/npm) + Go services.

## Quick Start

1. Each package: `pkg/@eser/<name>/` with `deno.json`, `mod.ts`, `mod.test.ts`
2. Unified version — use `deno run --allow-all ./pkg/@eser/codebase/versions.ts <patch|minor|major>`
3. JSR primary (`deno publish`), npm secondary (only `@eser/cli`)
4. Run `deno task validate` to check entire monorepo

## Key Principles

- Entry point: `mod.ts` (or `main.ts` for CLIs)
- Tests: `*.test.ts` co-located with source, benchmarks: `*.bench.ts`
- File naming: kebab-case enforced by pre-commit hook
- License header required on all `.ts` files
- Explicit `exports` and `publish.include` in each `deno.json`
- Never manually edit version fields — always use the version-bump script
- `@eser/standards` is the foundation — change carefully

## Go Services

Go code lives in `apps/services/` with independent git-tag versioning.
- Run `make go-ok` for Go-only validation
- Go does NOT use the unified version-bump script
- Follow hexagonal architecture — see `go-practices` skill

## References

See [rules.md](references/rules.md) for package conventions, adding packages, and templates.
