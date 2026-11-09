---
id: TASK-382
title: 'codebase: create the release as a draft in syncReleaseNotes'
status: Done
assignee: []
created_date: '2026-11-09 16:00'
updated_date: '2026-11-09'
labels:
  - codebase
  - release
  - bug
milestone: m-2
dependencies:
  - TASK-376
priority: medium
ordinal: 385000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in TASK-376, which made the Go `SyncReleaseNotes` (pkg/ajan/codebasefx/release.go:375, `eser codebase gh release-notes --create`) create the GitHub Release as a draft that the release run publishes once its archives are attached. Its TypeScript twin still creates a published release.

Root cause, pkg/@eserstack/codebase/release-notes.ts:

- `syncReleaseNotes` creates the release with `gh release create ${targetTag} --repo ${repo} --title ${title} --notes-file ${notesPath}` (:206): no `--draft`, so `releases/latest` names the new release before any archive is attached, the state TASK-376 removed from the release run.
- The title comes from `releaseTitle.replace("{tag}", targetTag)` (:202), which replaces the first `{tag}` only; Go uses `strings.ReplaceAll`.
- The edit path (:186, and the fallback at :224 after a lost create race) passes `--notes-file` only, as Go does, and must stay that way so a sync never changes the draft state of a release.

`syncReleaseNotes` runs gh through `shell.exec` with no seam, so no test pins the arguments it sends.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A test written first fails before the fix: it records the gh calls of `syncReleaseNotes` through a fake runner, with no real gh or repository
- [x] #2 The create arguments match Go's exactly: `release create <tag> --repo <repo> --title <title> --draft --notes-file <file>`
- [x] #3 The edit path is unchanged: `release edit <tag> --repo <repo> --notes-file <file>`, with no draft or latest flag, tested
- [x] #4 The doc comments, CLI output and docs that describe what the TypeScript `syncReleaseNotes` creates say it is a draft
- [x] #5 `pnpm ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause, pkg/@eserstack/codebase/release-notes.ts before the fix: `syncReleaseNotes` ran `gh release create ${targetTag} --repo ${repo} --title ${title} --notes-file ${notesPath}` (:206) with no `--draft`, while the Go `SyncReleaseNotes` (pkg/ajan/codebasefx/release.go:375) creates a draft since TASK-376. The title used `replace` (:202), the first `{tag}` only, where Go uses `strings.ReplaceAll`.

Seam first, no behaviour change: gh ran through `shell.exec` templates with no way to see its arguments. `GhRunner` (:119), `(args) => Promise<void>`, runs one gh command; the default (:122) runs the gh on PATH through `shell.exec.CommandBuilder` with captured output, as the template calls did. `hasGitHubRelease` (:134) and `syncReleaseNotes` (:159) take one as an optional last parameter, the way the Go twin takes `ReleaseEnv.GH`. The failing test was written after the seam, so no test run ever reached the real gh.

Fix: the create sends `release create <tag> --repo <repo> --title <title> --draft --notes-file <file>` (:241), Go's arguments in Go's order, and the title uses `replaceAll` (:226). Both edit calls, the existing release (:204) and the fallback after a lost create race (:263), are unchanged: `release edit <tag> --repo <repo> --notes-file <file>`, so a sync never changes the draft state.

Tests, pkg/@eserstack/codebase/release-notes.test.ts, through a fake `GhRunner` that records each call and reads the notes file (no gh, no repository):

- `syncReleaseNotes creates a missing release as a draft, with the arguments of the Go twin` (:317) pins the view and create calls and the notes. It failed before the fix with the create call missing `--draft` (AC1, AC2).
- `... edits only the notes of an existing release` (:372) and `... edits only the notes when a create loses the race` (:403) pin the edit arguments with no draft or latest flag (AC3). `... skips a missing release unless asked to create it` (:350) pins the skip path.

Docs (AC4): the module and function doc comments and the `createIfMissing` option say the release is created as a draft, the CLI prints "Created draft release" and points `--create-if-missing` at a draft, and the GitHub table of pkg/@eserstack/codebase/README.md says a new release is a draft. CHANGELOG.md has a Migration item under `@eserstack/codebase`: a caller of `syncReleaseNotes()` or `--create-if-missing` now gets a draft and publishes it with `gh release edit <tag> --draft=false --latest`.

`pnpm ok` passes (AC5).
<!-- SECTION:NOTES:END -->
