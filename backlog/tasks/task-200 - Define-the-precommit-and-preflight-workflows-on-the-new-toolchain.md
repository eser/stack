---
id: TASK-200
title: Define the precommit and preflight workflows on the new toolchain
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-26 10:00'
labels:
  - cutover
  - gate
  - manifest
milestone: m-1
dependencies:
  - TASK-199
priority: high
ordinal: 200000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rewrite .eser/manifest.yml.
Precommit:
- Delete gen-jsr-manifests and deno-publish-check.
- build-native-lib calls make.
- validate-package-configs checks package.json only, or is deleted (per decision jsr-publishing).
- The deno-formatter, deno-linter and deno-type-check steps become oxfmt --check (fix: oxfmt), oxlint (fix: --fix) and tsc --noEmit.
- deno-tests becomes `node --test` over pkg/**/*.test.ts and etc/scripts/*.test.ts, with spec output plus an LCOV reporter to etc/coverage.lcov and a per-file timeout. Never use --test-force-exit.
Preflight:
- Delete compile-current per the binaries decision.
- The npm-build, consumer-install, ajan-build, homebrew-dry-run and nix-dry-run steps run under node or make.
Scripts:
- test, test-watch, lint, fmt, check, build, bench and coverage become their node equivalents.
- Fix clean, which currently deletes pnpm-lock.yaml.
- Delete docs (deno doc --html) and container-build; repl is already gone (M0-T9).
- docs-lint points at the Go validate-docs.

Decisions this task waits on: decision-5 (Keep publishing to JSR or move the libraries to npm only); decision-20 (The documented command form for the gate and scripts); decision-33 (Type checker and emitter); decision-43 (Replacement for deno doc --html and --lint).

Plan key: M1-T6. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `grep -n deno .eser/manifest.yml` returns nothing outside validator excludes that M1-T37 removes
- [x] #2 `pnpm cli ok` runs every precommit step on Node (red results allowed until M1-T37)
- [x] #3 `pnpm cli preflight` runs every remaining preflight step on Node
- [x] #4 Coverage lands at etc/coverage.lcov
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TASK-200 (node 26.12.1):
- Precommit: gen-jsr-manifests, deno-publish-check and validate-package-configs are gone (decision-5: no deno.json is left to compare; the Go CheckPackageConfigs is already removed). build-native-lib still calls `make ajan-lib ajan-wasm-check`. The Deno steps became formatter (`pnpm exec oxfmt --check`, fix `pnpm exec oxfmt`), linter (`pnpm exec oxlint`, fix `--fix`), type-check (`pnpm exec tsc --noEmit`) and tests.
- tests: `node --test --experimental-test-coverage --test-timeout=120000`, spec to stdout and lcov to etc/coverage.lcov, over "pkg/**/*.test.ts" and "etc/scripts/*.test.ts" (433 files), with a 900 s step timeout. No --test-force-exit. Node has no per-file timeout: --test-timeout bounds each test, and a file that keeps the event loop alive after its last test hangs until the step timeout (checked with a leaked setInterval fixture).
- TASK-217 saw multi-file `--test-force-exit` runs on macOS drop whole child reports (fewer tests, 0 fail). The step does not use the flag. Three runs in a row of the step command each reported 5939 tests, 5939 pass, 0 cancelled, 737 lcov SF records, about 28 s per run.
- Validator excludes: the docs/api/ excludes are gone (decision-43, no generated HTML), and so are the hybrid-sniffer and gen-jsr-manifests excludes. Added pkg/@eserstack/test-kit/leaks.ts to validate-runtime-js-apis: it is Node-only by design (process.getActiveResourcesInfo) and only tests load it.
- Preflight: compile-current is deleted (decision-8). npm-build-cli, -noskills, -laroux and npm-consumer-install run under node; ajan builds and the homebrew and nix dry runs run under make and go.
- Scripts: test, test-watch, bench, lint, fmt, check, build and coverage use node, pnpm exec and the pinned tools; coverage-gen, docs, container-build and container-run are deleted (no root Dockerfile is left); clean removes only etc/coverage/ and etc/coverage.lcov; docs-lint is `eser codebase validate-docs`. The test description stays "Run tests with coverage", which pkg/ajan/workflowfx TestParseManifest_RepoManifest asserts.
- AC #1: `grep -n deno .eser/manifest.yml` prints nothing; the only case-insensitive matches are the two etc/codemods comments that M1-T37 removes.
- AC #2: `pnpm cli workflows run -e precommit` ran every step under node. Passed: all validators but one, codemod-tests, validate-circular-deps, validate-export-names, go-check, go-lint. Failed for other tasks: build-native-lib (codebasefx/validatortools references the removed ValidateRuntimeJSAPIs, codebase), formatter (.eser/recipes.json and 16 files in config, kit and noskills), linter (config dotenv/parser.ts, codebase package/workspace.ts), type-check (TS9007/9010/9017 in codebase, collector, config and noskills, plus the 2 TS2307 errors in etc/scripts/ffi-client.template.ts), tests (1 flaky p99 timing in ajan/wasm/loader-reactor.test.ts; it passed in the three later runs), go-tests (codebasefx TypeScript parity tests stop on node:sea in standards cross-runtime, standards). The validate-runtime-js-apis failure (test-kit/leaks.ts), the formatter finding on the manifest itself and the workflowfx manifest test were this task's and are fixed.
- AC #3: `pnpm cli workflows run -e preflight` ran all 8 steps under node. ajan-native-build and ajan-wasm-build fail because the bridge still calls the removed codebasefx.CheckPackageConfigs (codebase); the other six pass.
- AC #4: the tests step writes etc/coverage.lcov.
- Left for others: the root package.json `test` script still passes --test-force-exit; build.yml must run `pnpm cli ok` and `pnpm cli preflight` and drop the `deno coverage` step, because the gate writes etc/coverage.lcov itself (TASK-225); etc/scripts/package-export-roots.ts and its test have no caller now; the docs/api and deno.json rules in .gitignore, and the `deno` commands in AGENTS.md and docs/agents, still need changing.
<!-- SECTION:NOTES:END -->
