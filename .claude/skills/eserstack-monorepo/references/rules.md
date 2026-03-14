# eserstack Monorepo - Detailed Rules

## Package Layout

Scope: All packages under `pkg/@eser/*` and `pkg/@cool/*`

Rule: Every package follows a standard directory structure with specific file conventions.

```
pkg/@eser/<name>/
├── deno.json          # Package config (name, version, exports, publish)
├── mod.ts             # Entry point (barrel exports with license header)
├── mod.test.ts        # Entry point tests
├── *.ts               # Source modules (kebab-case names)
├── *.test.ts          # Co-located tests
├── *.bench.ts         # Co-located benchmarks
└── README.md          # Package documentation
```

---

## Package deno.json

Scope: Each package's `deno.json`

Rule: Must include name, version (matching root), exports, and publish configuration.

Correct:

```json
{
  "name": "@eser/my-package",
  "version": "4.0.43",
  "exports": {
    ".": "./mod.ts"
  },
  "publish": {
    "include": ["mod.ts", "*.ts", "README.md", "LICENSE"]
  }
}
```

Incorrect:

```json
{
  "name": "@eser/my-package",
  "version": "1.0.0",
  "exports": "./mod.ts"
}
```

**Why:** Unified versioning ensures all packages are released together. Explicit `publish.include` prevents accidentally publishing test files or internal scripts.

---

## License Headers

Scope: All `.ts` files in packages

Rule: Every TypeScript file must start with the Apache-2.0 license header.

Correct:

```typescript
// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
```

Validated by: `deno task cli codebase validate --only licenses`
Auto-fixed by: `deno task cli codebase validate --only licenses --fix`

---

## File Naming

Scope: All source files

Rule: Use kebab-case for all file names. Enforced by pre-commit hook.

Correct: `my-module.ts`, `http-client.test.ts`, `parse-args.bench.ts`

Incorrect: `myModule.ts`, `HttpClient.test.ts`, `ParseArgs.bench.ts`

---

## Module Entry Points

Scope: Package entry points

Rule: Use `mod.ts` as the barrel export file. Use `main.ts` for CLI entry points.

Correct:

```typescript
// mod.ts - re-export public API
export { myFunction } from "./my-function.ts";
export type { MyType } from "./types.ts";
```

Incorrect:

```typescript
// index.ts - wrong convention for Deno
export { myFunction } from "./my-function.ts";
```

---

## Development Commands

Scope: Development workflow

Rule: Use deno tasks defined in root `package.json`. Makefile targets wrap these.

| Command | Purpose |
|---------|---------|
| `deno task validate` | Full CI check (fmt, lint, license, types, tests, publish dry-run) |
| `deno task validate:fix` | Auto-fix version of validate |
| `deno task test:run` | Run tests with coverage |
| `deno task test` | Run tests in watch mode |
| `deno task check:mod` | Type-check all package entry points |
| `deno task cli` | Run the eser CLI |
| `deno task npm-build` | Build @eser/cli for npm |
| `make ok` | Same as `deno task validate` |
| `make help` | Show all available targets |

---

## Adding a New Package

Scope: Creating new `@eser/*` packages

Rule: Follow this exact sequence:

1. Create directory: `pkg/@eser/<name>/`
2. Create `deno.json` with name, version (matching current root version), exports, publish
3. Create `mod.ts` with license header and barrel exports
4. Create `mod.test.ts` with initial tests using `@std/assert`
5. Create `README.md` with package description, installation, usage
6. Package is auto-included via `pkg/@eser/*` glob in root `package.json`
7. Run `deno task validate` to verify

Template available at: `etc/templates/library-pkg/`

---

## Version Synchronization

Scope: All package versions

Rule: All packages share one version. Never manually edit version fields.

Correct:

```bash
deno task cli codebase versions patch    # 4.0.43 → 4.0.44
deno task cli codebase versions minor    # 4.0.43 → 4.1.0
make version-bump TYPE=patch             # Makefile shortcut
```

Incorrect:

```bash
# Manually editing one deno.json — breaks synchronization
vim ./pkg/@eser/fp/deno.json
```

---

## Key Files

| File | Purpose |
|------|---------|
| `deno.json` | Root config (lint rules, unstable features, excludes) |
| `package.json` | npm workspace root, deno task scripts |
| `.manifest.yml` | Pre-commit hooks (20+ checks) |
| `pkg/@eser/*/deno.json` | Per-package TS config |
| `pkg/@eser/*/mod.ts` | TS package entry points |
| `apps/services/go.mod` | Go module definition + tool directives |
| `apps/services/Makefile` | Go-specific build targets |
| `apps/services/.golangci.yaml` | Go linting configuration |
| `pkg/@eser/codebase/versions.ts` | Synchronized TS version bumping |
| `etc/templates/library-pkg/` | New TS package template |
| `etc/templates/go-service/` | New Go service template |
| `Makefile` | Unified command interface (Deno + Go) |

---

## Go Package Layout

Scope: Go services under `apps/services/`

Rule: Go services live in `apps/services/` with independent git-tag versioning. They do NOT participate in the unified TS version-bump script.

```
apps/services/
├── go.mod                          # Module definition + tool directives
├── go.sum
├── Makefile                        # Go targets: ok, check, lint, fix, test, build
├── .golangci.yaml                  # Linting rules
├── cmd/
│   └── serve/
│       └── main.go                 # HTTP server entry point
└── pkg/
    └── api/
        ├── adapters/
        │   └── appcontext/
        │       └── appcontext.go   # Composition root
        └── business/               # Pure business logic (no external deps)
```

**Go module path:** `github.com/eser/stack/apps/services`

**Go versioning:** Uses git tags (e.g., `apps/services/v0.1.0`), NOT the unified version-bump script.

---

## Go Development Commands

Scope: Go development workflow

| Command | Purpose |
|---------|---------|
| `make go-ok` | Run all Go checks (fmt, vet, lint, tests) |
| `make go-test` | Run Go tests with race detector |
| `make go-lint` | Run golangci-lint |
| `make go-fmt` | Auto-fix Go formatting |
| `make go-build` | Build Go binaries |
| `cd apps/services && make ok` | Same as `make go-ok` |

---

## Adding a Go Business Domain

Scope: Adding new business logic to Go services

Rule: Follow hexagonal architecture — business logic has zero external dependencies.

1. Create directory: `apps/services/pkg/api/business/<domain>/`
2. Define interfaces (ports) for external interactions
3. Implement pure business logic with no imports outside stdlib
4. Create adapters in `apps/services/pkg/api/adapters/` for external implementations
5. Wire in composition root (`apps/services/pkg/api/adapters/appcontext/`)
6. Run `make go-ok` to validate

See `go-practices` skill for detailed conventions.

---

## Templates

Scope: Project starter templates in `etc/templates/`

Rule: Templates are excluded from linting/formatting via `deno.json` excludes.

Available templates:
- `laroux-app/` — Full framework app with TypeScript, Tailwind
- `jsx-runtime-app/` — JSX runtime test app
- `library-pkg/` — New `@eser/*` package starter (with placeholders)
- `go-service/` — Go service with hexagonal architecture
