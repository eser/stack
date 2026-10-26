---
id: TASK-225
title: >-
  CI: move the validation jobs to Node and cover npm and the bridge module in
  Dependabot
status: In Progress
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-26 12:00'
labels:
  - cutover
  - ci
milestone: m-1
dependencies:
  - TASK-200
priority: high
ordinal: 225000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In build.yml:
- Remove the setup-deno and Deno cache steps from validate, preflight, smoke-test and cross-runtime-test.
- validate runs `pnpm cli ok` and uploads etc/coverage.lcov to Codecov in place of the `deno coverage` step.
- preflight runs `pnpm cli preflight`.
- smoke-test builds with node.
- Rename npm-no-deno-test to npm-consumer-test and drop its Deno assertions; update the needs lists that reference it.
- cross-runtime-test becomes a node-only matrix on ubuntu-24.04-arm and macos-latest, with no bun row.
update-contributors.yml switches to setup-node, pnpm and `pnpm cli codebase gh contributors --commit`.
.github/dependabot.yml gains gomod for pkg/@eserstack/ajan and the npm ecosystem.

Decisions this task waits on: decision-15 (Keep Bun support).

Plan key: M1-T31. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No setup-deno, setup-bun or Deno cache step remains in these jobs
- [ ] #2 The jobs pass on the cutover branch in a run started by the owner
- [ ] #3 Codecov receives LCOV; the needs graph is consistent; Dependabot config validates
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24; grep):
- .github/workflows/build.yml has 113 Deno and 8 Bun mentions; setup-deno at :86, :176, :336, :534, :747, :950 and :1021.
- validate (:63): :125 `deno task cli ok` and :134 `deno coverage ... --lcov` become `pnpm cli ok` and an etc/coverage.lcov upload. preflight (:151): :211 `deno task cli preflight`. smoke-test (:317): :365 `deno task cli build`, :368 and :371 `deno run ... npm-build.ts`. npm-no-deno-test (:404) is in the needs list at :722-729. cross-runtime-test (:497): matrix `runtime: [deno, node, bun]` (:514), oven-sh/setup-bun (:573-576), :579 `deno run pkg/@eserstack/ajan/scripts/build.ts` (deleted in the working tree by TASK-188; the patch in etc/temp/ci/task-188-ci.patch replaces it), :594-598.
- update-contributors.yml:21-27: setup-deno v2.9.5 and `deno task cli codebase gh contributors --commit`.
- .github/dependabot.yml: gomod covers only "/" (:21-22); add /pkg/@eserstack/ajan. npm at "/" (:36-37) exists.

TASK-198 (2026-10-25): the test and bench codemods left no site for hand edits in this task's files (0 unhandled), and none of its test files fails under `node --test --test-force-exit` on Node 26.12.1 when run alone.

TASK-225 (2026-10-26), build.yml:
- validate: setup-deno and the Deno cache are gone; it runs `pnpm cli ok`. The `deno coverage` step is deleted: the gate's tests step writes etc/coverage.lcov, and the Codecov step uploads that file.
- mux-no-js-runtime: drops node from PATH and checks for node only.
- preflight: no Deno; pnpm cache on setup-node; `pnpm cli preflight`.
- smoke-test: no Deno; `pnpm cli build`, plus `node .../npm-build.ts` for noskills and laroux.
- npm-no-deno-test is now npm-consumer-test ("npm Install Test"). The Deno check is gone, and `eser ajan version` passes when it fails gracefully or when it reports the bundle's version. The needs and if lists of publish and publish-ajan use the new name.
- cross-runtime-test: a node-only matrix on ubuntu-24.04-arm and macos-latest, with no deno or bun row. setup-node runs before `pnpm install`, ajan-lib-check runs on the macOS row, and the step runs `pnpm cli build` and `node etc/scripts/preflight-npm-consumer.ts --require-native`. The job keeps the name the old node rows had, "Cross-Runtime Test (node on <os>)".
- The release-gate error text names `pnpm cli codebase release`, which also covers the TASK-226 item for that message.
- node-ffi-cli gets `permissions: contents: read`. The Windows comment block is back above windows-smoke.

dependabot.yml gets a gomod entry for /pkg/@eserstack/ajan that ignores github.com/eser/stack (a local replace). The existing npm entry at "/" covers the pnpm workspace.

update-contributors.yml is unchanged: TASK-249 already moved it to setup-go and `go run ./cmd/eser codebase gh contributors --commit`, so it has no Deno.

Checks:
- actionlint passes on every workflow.
- dependabot.yml validates against the schemastore dependabot-2.0 schema (ajv).
- Local runs on Node 26.12.1, macOS arm64:
  - `pnpm cli preflight` passed.
  - The smoke-test builds and its four help commands passed.
  - `preflight-npm-consumer.ts --require-native` with ESER_AJAN_LIB_PATH set passed, and `make ajan-lib-check` passed.
  - The npm-consumer-test ajan step passed on both of its paths.
  - The mux PATH filter left no node on PATH.
- `pnpm cli ok` ran every step on Node and wrote etc/coverage.lcov. It failed on package code outside this task:
  - oxlint no-await-in-loop in codebase/package/workspace.ts;
  - tsc TS2307 in etc/scripts/ffi-client.template.ts;
  - gosec in pkg/ajan/noskillsfx/hook_parity_test.go;
  - the noskillsfx/golden TestReplay tests.

Open:
- AC #2 and the Codecov part of AC #3 need a run started by the owner.
- publish (setup-deno, gen-jsr-manifests, `deno publish`) and compile-binaries (setup-deno, Deno cache) still use Deno. They are TASK-226 release jobs.
- docs/agents/release-and-ci.md and .github/ARCHITECTURE.md still name npm-no-deno-test and the deno/bun matrix (TASK-230).
<!-- SECTION:NOTES:END -->
