---
id: TASK-203
title: 'codebase: remove Deno and Bun from the system handlers and release tooling'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-26 10:00'
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
- [x] #1 No Deno or Bun reference in codebase/cli-system, release.ts, versions.ts, package/ or codebasefx/changelog.go
- [x] #2 `pnpm cli codebase release patch --dry-run` updates VERSION and every package.json with no deno.json
- [x] #3 A test covers the missing-archive message
- [x] #4 `node --test` passes for the touched codebase test files
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test (all of codebase): 21 files, 21 pass, 150 tests, 0 fail. The touched tests (cli-system/handlers/update.test.ts, release-contract) need only the mechanical codemod.
- Non-test source (code, not comments): cli-system/handlers/install.ts:38-39,93 (cmd "deno", `jsr:${jsr}`, Deno.errors.PermissionDenied); update.ts:42,51,59,413 (deno and bun commands, "jsr:@eserstack/cli", Deno.errors.PermissionDenied); uninstall.ts:29,31,58; doctor.ts:153 (`deno --version`); release.ts:307 (`deno fmt CHANGELOG.md`) and :316-327 (deno.json comments); devCommand "deno task cli" in install.ts:46 and cli-system/app.ts:37; package/mod.ts:7 and package/loader.ts:188 (deno.json, deno.jsonc, jsr.json).
- Package totals: Deno. 6, Bun. 1, jsr: 4, bun: 2. import.meta.main (41) needs no change: it works on Node 26.
- Go and docs: pkg/ajan/codebasefx/changelog.go (1, the `deno fmt` comment) and codebasefx_changelog_format_test.go (1).

TASK-198 (2026-10-25): the test and bench codemods left no site for hand edits in this task's files (0 unhandled), and none of its test files fails under `node --test --test-force-exit` on Node 26.12.1 when run alone.

2026-10-26 (TASK-203): cli-system install, update and uninstall run npm only; the deno and bun entries, the `deno install ... jsr:@eserstack/cli` argument list and the Deno.errors.PermissionDenied checks are gone. install.ts exports isPermissionDenied (standards PermissionDeniedError, or EACCES/EPERM), used by install and update. update.ts exports updateConfig; DENO_TARGET_MAP is RELEASE_TRIPLE_MAP (Rust triples kept per decision-38); missingArchiveMessage and its tests are unchanged. doctor drops the Deno check, info drops DENO_DIR and BUN_INSTALL, app-opts no longer passes jsrPackage (CliApp keeps it optional and ignored so cli/main.ts compiles). release.ts formats CHANGELOG.md with `node --run fmt -- CHANGELOG.md` (oxfmt, no pnpm dependency check), and the deno.json comment and the JSR message are gone. package/ reads package.json only (no deno.json, deno.jsonc, jsr.json, jsr.jsonc; the imports field is removed). New tests: versions.test.ts (a stray deno.json or jsr.json is neither read nor written; it failed before the change), release-contract.test.ts (oxfmt step; the JSR manifest and .gitignore test is removed), update.test.ts (updateConfig), handlers/install.test.ts (isPermissionDenied). `node --test --test-force-exit "pkg/@eserstack/codebase/**/*.test.ts"`: 166 pass, 0 fail; tsc reports nothing under pkg/@eserstack/codebase/; oxlint is clean on the touched files except the existing no-await-in-loop findings in package/workspace.ts. `node ./pkg/@eserstack/cli/main.ts codebase versions patch --dry-run` lists VERSION 4.5.2 -> 4.5.3 and 45 package.json bumps and writes nothing. Open: AC #1 needs the Go comment at pkg/ajan/codebasefx/changelog.go:86 (`deno fmt`), which TASK-204 owns. AC #2: `codebase release patch --dry-run` refuses the dirty working tree, so it runs after the wave is committed.
TASK-204 reworded the deno fmt comment in pkg/ajan/codebasefx/changelog.go; `grep -rniwE "deno|bun"` over codebase/cli-system, release.ts, versions.ts, package/ and codebasefx/changelog.go now finds nothing, so AC #1 holds. AC #2 waits for a clean tree: release refuses a dirty one, so its dry run runs after the wave is committed.
On the clean cutover tree, `pnpm cli codebase release patch --dry-run` previews 4.5.2 -> 4.5.3 with a generated changelog and writes nothing (git status stays empty); no pkg/@eserstack/*/deno.json exists, and the versions step lists VERSION and the 45 package.json files. AC #2 holds.
<!-- SECTION:NOTES:END -->
