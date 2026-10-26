# Architecture and Code in eser/stack

Facts about the eser/stack repository that the architecture-guidelines,
design-principles and coding-practices skills refer to.

## Layout

- TypeScript packages live in `pkg/@eserstack/<name>/`. Packages with external
  dependencies follow the double-layered hexagonal layout (`domain/` and
  `adapters/`); `@eserstack/laroux-bundler` is the reference example.
- Go domain code lives in the `pkg/ajan/<name>fx/` packages, which the Go
  binaries use directly and the TypeScript libraries reach through the bridge
  (ADR 0005). `pkg/ajan/api/business/` is empty; `pkg/ajan/api/adapters/` holds
  the API service wiring in `appcontext/appcontext.go`.
- The cross-runtime adapter is `pkg/@eserstack/standards/cross-runtime/`, and
  the repository runs on Node only (decision-15). `validate-runtime-js-apis`
  (Go, in `pkg/ajan/codebasefx/runtime_js_apis.go`, run through the native
  library) reports members of Node's global `process` and every reference in
  code to the globals of the two runtimes ADR 0005 dropped, outside that
  adapter and the paths `.eser/manifest.yml` excludes. It has no baseline, so
  every violation fails.

## ADRs

ADRs live in `docs/adr/` as `NNNN-kebab-title.md`. A new one takes the number
after the highest file there. Older ADRs do not all use the sections that
architecture-guidelines: Architectural Decision Records lists; a new one does.

## Tests

- Tests run on `node:test`. Most files import it as `nodeTest`; the files
  converted from `@std/testing/bdd` import it as `bdd`. Assertions,
  mocks, error capture and the opt-in leak check come from the private
  `@eserstack/test-kit` package, which re-exports `@std/assert` and
  `@std/testing/mock` until M2-T4 moves it to `node:assert`.
- `pnpm cli test` runs `node --test` over `pkg/**/*.test.ts` and
  `etc/scripts/*.test.ts`, one process per file, with coverage written as LCOV
  to `etc/coverage.lcov`. `pnpm ok` runs the same command as part of the
  precommit workflow, and the Build workflow uploads that file to Codecov.

## Validators

- `validate-circular-deps` runs in the precommit workflow, after the native
  library build, and reads the members from the root `package.json`
  `workspaces`; run it alone with `pnpm cli codebase validate-circular-deps`
  after moving code between modules.
- `validate-code-conventions` enforces namespace imports, `??` defaults and
  curated re-exports (no `export * from`) on new code, with existing violations
  in `.eser/baselines/code-conventions.json`. It accepts a namespace import of a
  package sub-path; the resolver rejects a sub-path that the package's
  `package.json` does not export (`ERR_PACKAGE_PATH_NOT_EXPORTED`), and
  `validate-self-imports` reports a package that imports itself by name.
