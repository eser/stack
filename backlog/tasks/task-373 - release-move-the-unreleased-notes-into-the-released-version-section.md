---
id: TASK-373
title: 'release: move the Unreleased notes into the released version section'
status: Done
assignee: []
created_date: '2026-11-07 12:00'
labels:
  - release
  - bug
milestone: m-2
dependencies: []
priority: high
ordinal: 376000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/ajan/codebasefx/changelog.go:138 (InsertIntoChangelog) inserts a generated release section right after "# Changelog", which places `## 5.0.0 - <date>` above `## Unreleased`. The hand-written Migration notes stay under Unreleased, and etc/scripts/release-notes-from-changelog.ts copies only the version's section into the GitHub release notes, so the release notes miss the migration notes and CHANGELOG.md keeps them under Unreleased forever.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A release moves the content under `## Unreleased` into the new version section, with the generated entries, and leaves no stale Unreleased content (with a Go test)
- [x] #2 The TypeScript release path (pkg/@eserstack/codebase, release.ts and changelog code) does the same, or the notes say why that path delegates to the Go one (with a test where it does not delegate)
- [x] #3 A test runs etc/scripts/release-notes-from-changelog.ts against a released changelog and shows the migration notes in the output
- [x] #4 `pnpm ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause (lines at 4665f99e): InsertIntoChangelog, pkg/ajan/codebasefx/changelog.go:138, took "the first `## ` heading" as the insertion point (:164) and never treated Unreleased as a section of its own, so `## 5.0.0` landed above `## Unreleased` and the notes stayed where they were. The replace branch (:146-161) then dropped a version's whole body on a re-run, so any notes in it would have been lost once they moved.

Correction to the description, checked by running the script on such a file: the notes do not go missing from the release notes. changelog-text.ts:69-72 skips `## Unreleased` as a non-version heading, so it does not end a section, and the 5.0.0 notes ran on to `## 4.5.2`. They carried a literal `## Unreleased` heading, and every note written under it after the release would have joined the 5.0.0 section on a later re-sync. CHANGELOG.md keeping the notes under Unreleased is as described.

Layout, from CHANGELOG.md (4.3.0: the generated Fixed and Changed, then the hand-written Removed and Migration; 4.5.2: Fixed before Changed) and from the parser, which ends a section at the next version heading:

```
## Unreleased

## 5.0.0 - <date>

<text written directly under Unreleased>

### Added / Fixed / Changed / Removed   generated entries, then a hand-written list of that name
### Migration                           and any other hand-written subsection, as written
```

The empty `## Unreleased` stays above the section, so the next note has its place; it is not created when the changelog has none. A subsection with no text is dropped. Headings inside a fence are text, in both the outer and the inner split.

Re-run (`release same`, `changelog-gen` twice): the existing section of the version is replaced in place, with the new heading and generated entries. From its old body only what the generator wrote goes: list items under Added, Fixed, Changed or Removed that end in a commit hash or that the new section lists again. Everything else stays, and notes written under Unreleased since the first run join it. A second run with the same section is byte-identical, so the release plan has no CHANGELOG edit and changelog-gen says up to date. A changelog in the old state (`## 5.0.0` above `## Unreleased`) repairs itself: the stranded notes join the section and Unreleased goes first. The limit of telling the two apart without a marker in the file: a hand-written item under one of those four headings that ends in `(<7-40 hex>)` counts as generated on a re-run. Existing tests whose "old entry" had no hash now use one, since a real generated entry always has it; a hash-less item is kept, not dropped.

Changes:

- pkg/ajan/codebasefx/changelog.go, new changelog_merge.go: InsertIntoChangelog is the one origin. PlanRelease (release.go:187), GenerateChangelog (changelog_git.go:94, the bridge) and cmd/eser changelog-gen (codebase.go:300) all go through it.
- cmd/eser/codebase.go: `changelog-gen --dry-run` prints the section as it would be written, notes included, not only the generated entries. It reads CHANGELOG.md and writes nothing.
- pkg/@eserstack/codebase/changelog-gen.ts: insertIntoChangelog does the same as the Go function.
- pkg/@eserstack/codebase/release.ts: the changelog step surfaces its failure.
- .agents/skills/release-and-ci/references/release-process.md, docs/agents/release-and-ci.md: the move is documented.

AC #2, why the TypeScript release delegates: release.ts calls generateChangelog (changelog-gen.ts), which calls `codebaseGenerateChangelog` on the bridge, which runs GenerateChangelog in Go, and that calls InsertIntoChangelog. Only one implementation decides what a TypeScript release writes. The exported insertIntoChangelog does not delegate and nothing in the repository calls it (TASK-249 finding 1), but it is public API with the same bug, so it got the same layout. TestInsertIntoChangelogMatchesTypeScript runs all 16 layouts through both and compares the bytes; changelog-gen.test.ts has its own cases. TestReleaseChangelogMatchesTypeScript still compares a Go plan with the TypeScript changelog-gen plus oxfmt.

release.ts:293, a small fix inside this task: the bare `catch` printed "no user-facing changes" for every failure, while generateChangelog never throws for an empty commit range; it throws when the native library does not load (seen here: a new worktree has no built library, and the error text names every path searched) or when git or the write fails. The release then went on to commit, push and tag with no section, and the release gate rejects that only after the tag is pushed. It now throws "Changelog generation failed, so nothing was committed, pushed or tagged. Any version bump this run made is still in the working tree." with the cause's message. `release` takes an optional second argument, `ReleaseDeps`, for the test. "no user-facing changes" now means the run had no entries (`entryCount` 0), and the oxfmt step runs regardless, since Go writes the section either way.

Dry runs stay read-only: PlanRelease returns edits and writes nothing (TestPlanReleaseMovesUnreleased compares the whole tree before and after; the release dry-run test in cmd/eser now also checks CHANGELOG.md); GenerateChangelog returns before reading the file under DryRun (TestGenerateChangelogMovesUnreleased); changelog-gen --dry-run (TestCodebaseChangelogGenMovesUnreleased); release.ts passes dryRun on and skips every git step (release.test.ts). Its `content` still holds the generated entries only, so `node changelog-gen.ts --dry-run` of the TypeScript CLI previews those without the notes; the Go `eser codebase release --dry-run` prints the whole diff.

Tests, all failing before the fix where they name new behavior: 14 of the 16 layout cases plus TestPlanReleaseMovesUnreleased, TestGenerateChangelogMovesUnreleased, TestReleasedChangelogReachesTheReleaseNotes and TestInsertIntoChangelogMatchesTypeScript, and the two release.ts failure tests (the seam came first, as the error was still swallowed). AC #3: etc/scripts/release-notes-from-changelog.test.ts runs the script on what insertIntoChangelog writes and compares the whole output, and asserts a later note stays out; TestReleasedChangelogReachesTheReleaseNotes runs it on what PlanRelease plans.

On a copy of the real CHANGELOG.md with the real commits since v4.5.2 (99 commits, 87 entries, through the bridge with dryRun, which left the file alone): `## Unreleased`, then `## 5.0.0`, then Added, Fixed, Changed, Removed and Migration, then `## 4.5.2`; a second run is identical; oxfmt changes nothing; the script writes 114335 characters.

Open points for the owner, not changed here:

- GitHub limits a release body; from memory the limit is 125000 characters, not checked against GitHub from here. The 5.0.0 notes would be 114335 now, about 11000 short of that, and more commits or notes grow them. The release-notes job runs after publishing, so a body over the limit would fail there. Checking the limit, or trimming the notes, is worth doing before tagging.
- `eser codebase changelog-gen` on its own, with no release, takes the next patch as its version, so run alone today it would move the notes into a `## 4.5.3` section. A later `release major` would not take them out again. It was already wrong about the version before this change, and release-process.md now says so.

`pnpm ok` (go run ./cmd/eser ok) in this worktree: all checks passed, Go included.

No CHANGELOG entry: this fixes a bug and needs nothing from a user, which the Unreleased Migration section does not list; changelog-gen takes it from the commit subjects.
<!-- SECTION:NOTES:END -->
