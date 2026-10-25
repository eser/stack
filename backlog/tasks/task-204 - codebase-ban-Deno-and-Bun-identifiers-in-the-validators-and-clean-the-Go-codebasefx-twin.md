---
id: TASK-204
title: >-
  codebase: ban Deno and Bun identifiers in the validators and clean the Go
  codebasefx twin
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-26 10:00'
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
- [x] #1 Validator tests cover Deno.x, globalThis.Deno, Bun.x and an aliased global, all reported, plus a string literal 'deno.json' that is not reported
- [x] #2 .eser/baselines has no runtime-js-apis baseline
- [x] #3 lint-plugin.ts and its export are gone; npm-externals has no bun:ffi
- [x] #4 `git grep -wni 'deno\|bun' pkg/ajan/codebasefx pkg/@eserstack/codebase` matches only the validator patterns and their test fixtures
- [x] #5 `node --test pkg/@eserstack/codebase` and `make ok` pass; tsc and oxlint are clean for the package
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: covered by TASK-203's run (21 of 21 pass). validate-runtime-js-apis.test.ts holds Deno and Bun only as fixture strings (lines 20-22, 43-44, 81-85, 191, 211); ajan-ffi-parity.test.ts passes.
- Sanitizer options to remove from codebase tests (29): validate-runtime-js-apis 7, validate-self-imports 7, validate-naming-and-todos 4, validate-code-conventions 3, validate-secrets 3, validate-licenses 2, file-tool 2, ajan-ffi-parity 1.
- Source: lint-plugin.ts:4,13,17 (delete); npm-externals.ts:20,40 (bun:ffi); validate-runtime-js-apis.ts:9,47,176,204; validate-package-configs.ts:6,77-119 and validation/validators/package-configs.ts:13-34 (deno.json); validate-export-names.ts:6; validate-self-imports.ts:8-12 (deno publish).
- Go twin (mentions): pkg/ajan/codebasefx/workspace.go 10, workspace_validators.go 9, validators.go 5, types.go 3, errors.go 1, validatortools/validatortools.go 1; tests codebasefx_phase_e_test.go 19, phase_e2_test.go 11, phase_e5_test.go 11, workspace_test.go 9, workspace_validators_test.go 3.
- Docs: pkg/@eserstack/codebase/README.md (8), pkg/@eserstack/codebase/AGENTS.md (2).

TASK-198 (2026-10-25): the test and bench codemods left no site for hand edits in this task's files (0 unhandled), and none of its test files fails under `node --test --test-force-exit` on Node 26.12.1 when run alone.

TASK-204 (2026-10-26, node 26.12.1):
- validate-runtime-js-apis: one implementation, in Go on the M0-T16 lexer (pkg/ajan/codebasefx/runtime_js_apis.go, moved out of validators.go). Rules: every `Deno` and `Bun` identifier in code (globalThis.Deno, aliases such as g.Bun, typeof checks, test files), and the process rule kept per decision-16 with the local-binding exemption; comments and string, template and regex literals never count; only standards/cross-runtime/ is skipped. The TS validator calls it through EserAjanCodebaseValidateFiles, as validate-naming-and-todos does, so the TS and Go engines report the same issues. Baseline support is gone (no .eser/baselines/runtime-js-apis.json, no --write-baseline). Tests: runtime_js_apis_test.go (17 rule cases, exact messages) and validate-runtime-js-apis.test.ts (3 bridge tests, including "deno.json" in a string, not reported).
- On the repo with no excludes the validator finds no Deno or Bun reference in code; 50 process.* findings remain, 31 in .test.ts files that the manifest's ".test.ts" exclude still covers (ajan 21, shell 6, etc/scripts 2, test-kit 1, etc/codemods 1). With the manifest excludes the step passes.
- Deleted validate-package-configs (TS, validation/validators/package-configs.ts, module.ts entry, ./validate-package-configs export; Go CheckPackageConfigs, its result types and the validate-package-configs tree tool) per decision-5: with package.json as the only package config there is nothing to compare. Cross-package: removed the EserAjanCodebaseCheckPackageConfigs export from pkg/@eserstack/ajan (main.go, bridge_codebase.go, ffi/types.ts, ffi/backend-node.ts, wasm/loader-reactor.ts and its tests; reactor_protocol_test.go now counts 98 names).
- codebasefx: workspace discovery, the circular-deps graph and mod-exports entry points read package.json only (RawDeno, Imports and the deno.json workspace branch removed); version planning reads package.json only (configFilePriority, the jsonc comment stripper removed).
- Parity tests: TestPlanVersionsMatchesTypeScript and TestReleaseChangelogMatchesTypeScript run the TS side with `node <file.ts>` and format with the repo's oxfmt; TestFormatChangelogSectionMatchesDenoFmt became TestFormatChangelogSectionMatchesOxfmt. The changelog comparison failed: FormatChangelogSection wrapped list items at 80 columns as dprint did, while oxfmt with proseWrap "preserve" keeps them on one line (changelog_format.go wrapListItem). Fixed at the origin: FormatChangelogSection keeps items on one line and still rewrites *x* as _x_; both comparisons pass. The workspace fixture lost its deno.json and jsr.jsonc files, so TestReleaseContract now also bumps @fixture/two.
- Deleted lint-plugin.ts and its export (decision-34); npm-externals.ts already had no bun:ffi. Docs: codebase README (tools table, baseline section, upgrade notes) and AGENTS.md.
- Open for AC #4: the remaining matches outside the validator are the README upgrade note that describes the ban, and two TASK-203 test files (changelog-text.test.ts:65 lists bun in a package-manager regex; versions.test.ts asserts deno.json is never written). Open for AC #5: `node --test pkg/@eserstack/codebase` passes (151 of 151) and tsc reports nothing in codebase or ajan; oxlint reports no-await-in-loop twice in package/workspace.ts (TASK-203); `make ok` fails outside this task, in noskillsfx (gosec in hook_parity_test.go, TestSyncAdaptersMatchTypeScript, golden TestReplay). go vet, go test and golangci-lint pass for codebasefx and for the bridge module.
The integration agent cleared the rest of AC #4 and the codebase oxlint findings: the `bun` alternative left the package-manager regex in changelog-text.test.ts, the README upgrade note describes the ban without naming the globals, and the two nested `for await` loops in package/workspace.ts carry `no-await-in-loop` pragmas, because the patterns expand one at a time to keep the path order. `git grep -wni 'deno\|bun' pkg/ajan/codebasefx pkg/@eserstack/codebase` now matches only validate-runtime-js-apis.ts, runtime_js_apis.go and their tests, plus versions.test.ts, a regression test that a stray deno.json is never read or written. For AC #5, `node --test pkg/@eserstack/codebase` gives 151 of 151, and oxlint and tsc report nothing for the package. AC #5 stays open until `make ok` passes; it fails only in pkg/ajan/noskillsfx, which TASK-211 AC #3 is fixing.
After TASK-211 re-recorded the noskillsfx goldens, `make ok` passes, and `pnpm cli ok` passes on the cutover tree ("All checks passed!"), so AC #5 holds.
<!-- SECTION:NOTES:END -->
