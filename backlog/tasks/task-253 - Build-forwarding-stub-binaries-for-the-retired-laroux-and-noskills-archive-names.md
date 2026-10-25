---
id: TASK-253
title: >-
  Build forwarding stub binaries for the retired laroux and noskills archive
  names
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 12:30'
labels:
  - go
  - distribution
  - migration
milestone: m-3
dependencies:
  - TASK-251
priority: high
ordinal: 253000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Installed v4.5.x laroux and noskills binaries run the old update.ts. A release with no matching archive gives them the old checksum and download failure (update.ts:124-155). Per decision legacy-binary-updates, add cmd/legacy-forwarder, a tiny Go program built once per name.
- The laroux stub runs `npx --yes laroux@<version> <args>` when npx exists, and otherwise prints `npm i -g laroux`. It also answers `update` and `version`.
- The noskills stub works the same way for `noskills` until M4-T6 replaces it with the real binary.
`eser dev compile` (M3-T10) packages the stubs as `laroux-v<ver>-<triple>` and `noskills-v<ver>-<triple>` archives in SHA256SUMS.txt, signed like the others. Preflight runs the old update.ts flow from a v4.5.2-named binary fixture against a local release and checks that the stub replaces it and forwards.

Decisions this task waits on: decision-9 (What installed v4.5.x laroux and noskills binaries update to); decision-38 (Release archive names).

Plan key: M3-T14. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tests cover forwarding with a fake npx and the message without one
- [x] #2 The preflight test proves a v4.5.2-named laroux and noskills self-update to the stubs, and the stubs then run the npm packages
- [x] #3 The stub retirement rule is recorded in ADR 0005
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25.
- cmd/legacy-forwarder (main.go, forwarder.go): one program, built once per name. The name comes from the linker (-X main.name=laroux), like the version (-X main.version), not from argv[0], because a self-update or a package manager can rename the file; a build without main.name refuses to run. It answers version, --version (the Homebrew formula test runs it), update, and the v4.5.x long forms system version and system update; everything else runs `npx --yes <name>@<version> <args>` with stdio and the exit code passed through, or prints `npm i -g <name>` and exits 1 when npx is not on PATH. It sets ESER_LEGACY_FORWARDER=<name> for npx and refuses to forward when it finds it set, so a package bin that resolves back to the stub cannot loop.
- `eser dev compile`: ReleaseBinary has a NameVar field; ReleaseBinaries lists laroux and noskills with Main ./cmd/legacy-forwarder, so the release has laroux-v<ver>-<triple> and noskills-v<ver>-<triple> archives in SHA256SUMS.txt. The cosign step signs every *.tar.gz and *.zip in the bundle, so no CI change is needed. With the archives back, `eser dev homebrew` updates the laroux and noskills formulas again (to the stubs); nix is unchanged (eser and noskills-server only).
- AC #1: forwarder_test.go: TestForwardsToTheNpmPackageThroughNpx, TestPrintsTheNpmInstallCommandWithoutNpx, TestAnswersVersionAndUpdateItself, TestRefusesToForwardToItself, TestRefusesToRunWithoutAName, TestBuiltBinaryTakesItsNameFromTheLinker. The fake npx is the test binary copied as npx.
- AC #2: legacy_update_test.go TestLegacyBinariesUpdateToTheStubs compiles both stubs for the host with CompileRelease, serves them as release v5.0.0 from httptest (latest-release endpoint plus downloads), and runs testdata/legacy_update.ts under deno, which calls update.ts updateCompiledBinary for a v4.5.2 laroux and noskills fixture; the harness points execPath at the fixture and fails every URL it does not map to the local server. The test checks the checksum and update output, that the fixture is now the stub, and that it forwards to the fake npx. update.ts now exports updateCompiledBinary for this. The preflight workflow runs it as step legacy-binary-update with ESER_PREFLIGHT=1 (fails without deno); in `go test ./...` it skips without deno. The harness uses update.ts on main, not the v4.5.2 file; the archive name, SHA256SUMS lookup, extract and replace steps are the same in both.
- AC #3: ADR 0005 Decision Outcome, bullet "Installed v4.5.x binaries". decision-9 says only that the owner retires the stubs; the rule written from that: the noskills stub lasts until TASK-261 ships the Go noskills under the same archive name; the laroux stub is built until an owner decision, recorded in Appendix A with the first release without it, whose Migration section points to `npm i -g laroux`.
- Finding, fixed on the owner's go-ahead: a deno-compiled binary was detected as invoker "deno", not "binary", because detectRuntime() (standards/cross-runtime/adapters/shared.ts) returns "deno" whenever globalThis.Deno exists, and it exists in `deno compile` output. So `laroux update` and `noskills update` in v4.5.x binaries run `deno install -r -g -A -f --name <cmd> jsr:@eserstack/cli` and never reach updateCompiledBinary. detectExecutionContext now passes shared.isStandaloneBinary() (Deno.build.standalone) to detectInvoker, which returns binary/installed for it, and reports runtime "compiled"; tests in execution-context.test.ts. A compiled probe named laroux now reports {"runtime":"compiled","invoker":"binary","mode":"installed"}. Binaries from 4.5.3 on can self-update to the stubs; 4.5.0 to 4.5.2 binaries keep the old behavior.
- Gates: make ok and deno task cli ok passed.
<!-- SECTION:NOTES:END -->
