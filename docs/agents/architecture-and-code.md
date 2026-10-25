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
- The cross-runtime adapter is `pkg/@eserstack/standards/cross-runtime/`;
  `validate-runtime-js-apis` enforces it for the `Deno.*`, `process.*` and
  `Bun.*` APIs it lists, outside the paths `.eser/manifest.yml` excludes.

## ADRs

ADRs live in `docs/adr/` as `NNNN-kebab-title.md`. A new one takes the number
after the highest file there. Older ADRs do not all use the sections that
architecture-guidelines: Architectural Decision Records lists; a new one does.

## Tests

- Both `Deno.test` and `@std/testing/bdd` are in use across packages; a few
  older files use `_test.ts` (for example in `pkg/@eserstack/workflows`).
- `deno task cli test` runs the suite in parallel with `--trace-leaks` and
  writes coverage to `etc/coverage/`. `deno task cli ok` runs it as part of the
  precommit workflow, and the Build workflow uploads LCOV coverage to Codecov.

## Validators

- `validate-circular-deps` (in `@eserstack/codebase`) is not part of the
  precommit workflow; run `deno task cli codebase validate-circular-deps` after
  moving code between modules.
- `validate-code-conventions` enforces namespace imports, `??` defaults and
  curated re-exports (no `export * from`) on new code, with existing violations
  in `.eser/baselines/code-conventions.json`. It accepts a namespace import of a
  package sub-path; the resolver rejects a sub-path that the package's
  `package.json` does not export (`ERR_PACKAGE_PATH_NOT_EXPORTED`), and
  `validate-self-imports` reports a package that imports itself by name.
