---
id: TASK-204
title: >-
  codebase: ban Deno and Bun identifiers in the validators and clean the Go
  codebasefx twin
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 19:38'
labels:
  - cutover
  - codebase
  - validators
  - go
milestone: m-1
dependencies:
  - TASK-198
  - TASK-202
  - TASK-191
priority: high
ordinal: 204000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Change validate-runtime-js-apis (TS and the Go codebasefx twin):
- The deno and bun rules report every `Deno` and `Bun` identifier reference in code, including globalThis.Deno, globalThis.Bun and aliased globals such as `g.Deno`, with no test-file exemption.
- The rules use the M0-T16 lexer, so string literals and comments do not count. That keeps the user-project support kept by decision user-deno-projects legal.
- Keep the process rule per decision cross-runtime-facade.
In codebasefx, clean up the other Deno-specific parts:
- Remove the deno.json branch in pkg/ajan/codebasefx/workspace.go:108-114.
- Remove RawDeno, DenoValue and 'missing_in_deno' in types.go:130-197, and the deno mentions in errors.go, registry.go, validators.go and workspace_validators.go, together with their phase_e and workspace tests.
- Reduce the Go and TS validate-package-configs to package.json, or delete them, per decision jsr-publishing.
Also delete lint-plugin.ts and its ./lint-plugin export, and remove `bun:ffi` and its comment from codebase/npm-externals.ts:20, :40. Port the remaining codebase tests, and update the codebase README and pkg/@eserstack/codebase/AGENTS.md.

Decisions this task waits on: decision-5 (Keep publishing to JSR or move the libraries to npm only); decision-12 (Keep supporting users whose own projects use Deno); decision-15 (Keep Bun support); decision-16 (Keep the @eserstack/standards runtime facade).

Plan key: M1-T10. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Validator tests cover Deno.x, globalThis.Deno, Bun.x and an aliased global, all reported, plus a string literal 'deno.json' that is not reported
- [ ] #2 .eser/baselines has no runtime-js-apis baseline
- [ ] #3 lint-plugin.ts and its export are gone; npm-externals has no bun:ffi
- [ ] #4 `git grep -wni 'deno\|bun' pkg/ajan/codebasefx pkg/@eserstack/codebase` matches only the validator patterns and their test fixtures
- [ ] #5 `node --test pkg/@eserstack/codebase` and `make ok` pass; tsc and oxlint are clean for the package
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: covered by TASK-203's run (21 of 21 pass). validate-runtime-js-apis.test.ts holds Deno and Bun only as fixture strings (lines 20-22, 43-44, 81-85, 191, 211); ajan-ffi-parity.test.ts passes.
- Sanitizer options to remove from codebase tests (29): validate-runtime-js-apis 7, validate-self-imports 7, validate-naming-and-todos 4, validate-code-conventions 3, validate-secrets 3, validate-licenses 2, file-tool 2, ajan-ffi-parity 1.
- Source: lint-plugin.ts:4,13,17 (delete); npm-externals.ts:20,40 (bun:ffi); validate-runtime-js-apis.ts:9,47,176,204; validate-package-configs.ts:6,77-119 and validation/validators/package-configs.ts:13-34 (deno.json); validate-export-names.ts:6; validate-self-imports.ts:8-12 (deno publish).
- Go twin (mentions): pkg/ajan/codebasefx/workspace.go 10, workspace_validators.go 9, validators.go 5, types.go 3, errors.go 1, validatortools/validatortools.go 1; tests codebasefx_phase_e_test.go 19, phase_e2_test.go 11, phase_e5_test.go 11, workspace_test.go 9, workspace_validators_test.go 3.
- Docs: pkg/@eserstack/codebase/README.md (8), pkg/@eserstack/codebase/AGENTS.md (2).
<!-- SECTION:NOTES:END -->
