---
id: TASK-366
title: >-
  codebase: keep .gitignore honoured when the validators run on the WASM
  fallback
status: To Do
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
- [ ] #1 With the native library unavailable (`--no-experimental-ffi`), the validators enumerate the same files as on the native path, with a test
- [ ] #2 A walk that cannot honour .gitignore is never used silently: the caller lists files with git itself or fails with an error that says why
<!-- AC:END -->
