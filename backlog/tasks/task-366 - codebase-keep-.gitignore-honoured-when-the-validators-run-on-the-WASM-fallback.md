---
id: TASK-366
title: >-
  codebase: keep .gitignore honoured when the validators run on the WASM
  fallback
status: Done
assignee: []
created_date: '2026-10-25 22:57'
labels:
  - codebase
  - validators
  - bug
dependencies: []
priority: high
ordinal: 369000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while a hooked commit failed: on the WASM fallback (native library not loadable), pkg/ajan/codebasefx runGit always fails (git_wasip1.go), so WalkSourceFiles drops from walkViaGit to walkViaFS and every validator scans gitignored build output (bin/, pkg/@eserstack/ajan-*/libeser_ajan.*, *.wasm, .DS_Store). validate-large-files and validate-filenames then fail on files git never tracks. The TypeScript side (file-tools-shared.ts) only falls back to its own `git ls-files --exclude-standard` listing when the bridge call fails, not when the bridge silently returned an fs walk.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 With the native library unavailable (`--no-experimental-ffi`), the validators enumerate the same files as on the native path, with a test
- [x] #2 A walk that cannot honour .gitignore is never used silently: the caller lists files with git itself or fails with an error that says why
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-26. Root cause: pkg/ajan/codebasefx/git_wasip1.go:18 runGit always fails on wasip1, and pkg/ajan/codebasefx/walker.go:40-45 (before the fix) treated any walkViaGit error, that one included, like "not a git repository" and fell through to walkViaFS, which skips only defaultExcludeSubstrings. Every bridge name that walks git-aware (codebaseWalkFiles, codebaseValidateFiles and both streams) got that fs walk on the WASM build without a word. The TypeScript fallback in file-tools-shared.ts ran only when the bridge answered with an error, and the validators that run in Go (withGoValidator in file-tool.ts, validate-naming-and-todos, validate-runtime-js-apis, runBuiltinValidators) had no fallback at all.

Fix, at the origin and in two parts. Go: a git-aware walk that cannot run git (runGit on wasip1, or exec.ErrNotFound on native, both now ErrGitUnavailable) fails with an error that names the fix instead of walking the filesystem; a directory outside a git repository still gets the fs walk, as before. The new codebasefx.WalkListedFiles walks a listing the caller made, and the bridge requests take it as `gitFiles` (walkRequestFiles in bridge_codebase.go). TypeScript: git-listing.ts runs `git ls-files -z --cached --others --exclude-standard` on the host, and bridgeGitOptions adds the listing to every git-aware request when the WASM backend serves it (outside a repository it sends gitAware false, the native walk's fs fallback); the native backend still lets Go run git. The TypeScript fallback of walkSourceFiles uses the same listing, which now throws when git cannot run instead of walking silently.

Why not read .gitignore in the wasi build: matching git means nested .gitignore files, negation, .git/info/exclude, core.excludesFile and tracked files that match an ignore rule, a second gitignore engine to keep in step with git. Why not only report the walk's mode: the validators run inside Go, so the caller would still have to send the files back; sending git's own listing gives the same files as the native path with one small request field. WalkOptions stays as it was: a slice field pushes it past gocritic's hugeParam limit. CHANGELOG.md has migration entries under @eserstack/codebase, codebasefx and the native bridge, and the ajan README notes `gitFiles`.

Tests (the parity test failed first: the WASM run listed bin/output.js): pkg/@eserstack/codebase/wasm-gitignore.test.ts with wasm-gitignore.fixture.ts runs codebaseWalkFiles, the walk stream, validate-large-files, runBuiltinValidators and the validate stream in a temporary git repository with a gitignored 2 KB file, once on the native library and once under `node --no-experimental-ffi`, and both see the same three files; Go tests TestWalkSourceFiles_UsesTheCallersGitListing and TestWalkSourceFiles_FailsWhenGitCannotRun in codebasefx_walker_test.go. `pnpm ok` passes.

Left as found: walkViaGit passes --full-name, so a root below the repository top joins top-relative paths to the subdirectory and lists nothing; bridgeCodebaseValidateFilesStreamCreate does not pass the request's exclude to the walk.
<!-- SECTION:NOTES:END -->
