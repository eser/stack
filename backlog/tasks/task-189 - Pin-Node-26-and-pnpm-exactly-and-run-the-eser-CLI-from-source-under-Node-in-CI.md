---
id: TASK-189
title: >-
  Pin Node 26 and pnpm exactly, and run the eser CLI from source under Node in
  CI
status: In Progress
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 07:56'
labels:
  - ci
  - tooling
  - pnpm
  - ffi
milestone: m-0
dependencies:
  - TASK-174
  - TASK-175
  - TASK-176
  - TASK-177
  - TASK-188
  - TASK-185
priority: high
ordinal: 189000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pin the versions. The integration agent makes the root package.json change:
- Root package.json: packageManager `pnpm@11.18.0` (an exact version, as corepack and pnpm/action-setup require) and engines.node `>=26.9` (decision-14), the first Node with node:ffi on by default. Add .node-version with the exact Node 26 minor that M0-T2 recorded for its node:ffi measurements.
- Every job in build.yml and publish-ajan.yml: node-version-file instead of node-version 'latest', and pnpm/action-setup without `version: 10`, so it reads packageManager.
- compile-binaries: add setup-node, which it lacks today.
Then add a CI job (or extend cross-runtime-test) that builds the library with make and runs these under plain node through node:ffi, with no FFI flag: `node pkg/@eserstack/cli/main.ts ajan version`, `codebase validate-eof` and `codebase validate-licenses`. For this, change the open path in pkg/@eserstack/ajan/ffi/backend-node.ts from koffi to node:ffi on the existing exports (`dlopen` with the symbol map, returned strings read and released with `EserAjanFree` the way M0-T2 recorded), and fix what the job exposes. The Deno and Bun backends, the koffi dependency and its manifest entries stay until M1-T8 removes them (decision-37). This proves the gate runner that M1 depends on before the red window opens. Because of this job, wave B packages with FFI-backed tests can rely on the node:ffi backend once M1-T8 lands.

Decisions this task waits on: decision-14 (Minimum Node.js version); decision-41 (pnpm version pin).

Plan key: M0-T13. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 packageManager is exactly `pnpm@11.18.0`; no `version: 10` and no node-version 'latest' remain in .github/workflows; root package.json has engines.node `>=26.9`, and .node-version names the Node minor recorded in the M0-T2 notes
- [ ] #2 The new CI job is green on macOS arm64 and Linux arm64, and ffi/backend-node.ts loads the library through node:ffi, not koffi
- [ ] #3 `pnpm install --frozen-lockfile` succeeds with the pinned pnpm in CI
- [x] #4 `deno task cli ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24. Done in the working tree: root package.json has packageManager 'pnpm@11.18.0' and engines.node '>=26.9'; .node-version is 26.12.1, the Node the TASK-175 node:ffi measurements ran on; pnpm install --frozen-lockfile passes locally with the pinned pnpm. pkg/@eserstack/ajan/ffi/backend-node.ts now opens the library through node:ffi instead of koffi: the ~100 C prototype strings stay as they were and parseSignature turns each into a node:ffi definition (void* to pointer, const char* to string, int to int32, void), one ffi.dlopen binds them all, returned strings are read with ffi.toString and released with EserAjanFree in a finally, and close calls the library's close. node:ffi is imported through an opaque specifier (Deno does not know it); when it cannot load, open throws and the loader falls back to the WASM build. The koffi dependency and its manifest entries stay until M1-T8, as the task says. Verified under plain node 26.12.1 with no FFI flag: 'node pkg/@eserstack/cli/main.ts ajan version' prints eser-ajan version 4.5.2 from the native library (a non-profile export works, so it is not the reactor); with --no-experimental-ffi it falls back to the reactor. 'codebase validate-eof' and 'codebase validate-licenses' run standalone report the same findings under node and deno (3 and 9): a standalone validator run reads its excludes from --exclude flags only, not from the manifest, so with the manifest's excludes (docs/api/ and third-party/; .eser/recipes/ and third-party/) both pass (2,764 and 1,381 files). Tests: ffi/backend-node.test.ts (the signature parser, an unsupported C type); ajan-ffi-parity.test.ts reads the same prototype strings (label renamed); wasm/node-reactor-log.test.ts no longer needs ESER_AJAN_NATIVE=disabled, since --no-experimental-ffi alone now turns the native path off. deno task cli ok passed. Waiting on the owner: .github/workflows changes need approval, so they are a patch, etc/temp/ci/task-189-ci.patch (gitignored), which applies on top of etc/temp/ci/task-188-ci.patch (checked: both apply in order to the current workflows, and the result parses as YAML). It drops 'version: 10' from every pnpm/action-setup (it then reads packageManager), replaces every node-version 'latest' and '26' (and the cross-runtime node row) with node-version-file: .node-version, adds setup-node to compile-binaries, and adds the node-ffi-cli job (ubuntu-24.04-arm and macos-latest: setup Go, pnpm and Node from the pins, pnpm install --frozen-lockfile, make ajan-lib, then the three CLI commands under plain node, the validators with the manifest's excludes). AC #1 (no version: 10 or 'latest' left in .github/workflows), #2 (the job green on both OSes) and #3 (frozen install in CI) close once the owner applies the patches and CI runs.

2026-10-25: the owner approved applying the CI patches. etc/temp/ci/task-{188,189,249,251,264}-ci.patch were applied in that order to .github/workflows (build.yml, publish-ajan.yml, update-contributors.yml); actionlint is clean; make ok and deno task cli ok passed. AC #1: no 'version: 10' and no node-version 'latest' or '26' remain in .github/workflows (grep); .node-version is 26.12.1. AC #2 (the node-ffi-cli job green on macOS arm64 and Linux arm64) and AC #3 (frozen install in CI) need a CI run, which starts only when the owner pushes.
<!-- SECTION:NOTES:END -->
