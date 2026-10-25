---
id: TASK-203
title: 'codebase: remove Deno and Bun from the system handlers and release tooling'
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 16:00'
labels:
  - cutover
  - codebase
  - release
milestone: m-1
dependencies:
  - TASK-198
  - TASK-199
  - TASK-201
  - TASK-202
priority: high
ordinal: 203000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Changes in codebase:
- Delete the deno and bun entries in cli-system/handlers install.ts:38-39, update.ts:41-52 (which also removes the hard-coded jsr:@eserstack/cli bug) and uninstall.ts, including the `bun install -g` paths.
- Use PermissionDeniedError at install.ts:92-93 and update.ts:370-371.
- Keep the missing-archive npm pointer from M0-T21, or add it here if that task was declined.
- release.ts:307 formats CHANGELOG.md with oxfmt. Drop the deno.json comments and the JSR message (:316-327, :719).
- package/types.ts:7-24 and :63-101 drop deno.json and deno.jsonc, and jsr.json per decision jsr-publishing.
- versions.ts syncs VERSION and package.json only.
- Simplify release-contract.test.ts.
- Update the Go twin text in pkg/ajan/codebasefx/changelog.go:90 (the `deno fmt` comment).
The touched tests are ported. Changes stay minimal, because M3 replaces these commands in Go.

Decisions this task waits on: decision-5 (Keep publishing to JSR or move the libraries to npm only); decision-15 (Keep Bun support).

Plan key: M1-T9. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No Deno or Bun reference in codebase/cli-system, release.ts, versions.ts, package/ or codebasefx/changelog.go
- [ ] #2 `pnpm cli codebase release patch --dry-run` updates VERSION and every package.json with no deno.json
- [ ] #3 A test covers the missing-archive message
- [ ] #4 `node --test` passes for the touched codebase test files
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test (all of codebase): 21 files, 21 pass, 150 tests, 0 fail. The touched tests (cli-system/handlers/update.test.ts, release-contract) need only the mechanical codemod.
- Non-test source (code, not comments): cli-system/handlers/install.ts:38-39,93 (cmd "deno", `jsr:${jsr}`, Deno.errors.PermissionDenied); update.ts:42,51,59,413 (deno and bun commands, "jsr:@eserstack/cli", Deno.errors.PermissionDenied); uninstall.ts:29,31,58; doctor.ts:153 (`deno --version`); release.ts:307 (`deno fmt CHANGELOG.md`) and :316-327 (deno.json comments); devCommand "deno task cli" in install.ts:46 and cli-system/app.ts:37; package/mod.ts:7 and package/loader.ts:188 (deno.json, deno.jsonc, jsr.json).
- Package totals: Deno. 6, Bun. 1, jsr: 4, bun: 2. import.meta.main (41) needs no change: it works on Node 26.
- Go and docs: pkg/ajan/codebasefx/changelog.go (1, the `deno fmt` comment) and codebasefx_changelog_format_test.go (1).

TASK-198 (2026-10-25): the test and bench codemods left no site for hand edits in this task's files (0 unhandled), and none of its test files fails under `node --test --test-force-exit` on Node 26.12.1 when run alone.
<!-- SECTION:NOTES:END -->
