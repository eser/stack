---
id: TASK-91
title: Fail laroux build and serve on a failed bundler build and clean up after it
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - laroux-server
  - laroux-bundler
  - bug
dependencies: []
references:
  - pkg/@eserstack/laroux-bundler/system.ts
  - pkg/@eserstack/laroux-server/commands/build.ts
  - pkg/@eserstack/laroux-server/main.ts
priority: high
ordinal: 91000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
system.build() catches every build error, logs it and returns { success: false } (laroux-bundler/system.ts:742-747). laroux-server ignores that result in commands/build.ts:146 and main.ts:492 and :499, so `laroux build` continues to bundle analysis and exits 0, and dev and serve start on a stale or empty dist/. build() also calls virtualSourceResult.cleanup() only on the success path (system.ts:571), so a failed build leaves dist/_bundle_src behind. Rule: coding-practices: Release Resources Where They Are Acquired.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 laroux build exits non-zero and serve does not start when the build fails, with a test
- [x] #2 The virtual source is cleaned up in a finally block in the scope that created it
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

laroux: Code matches the claims:
- system.ts build() calls virtualSourceResult.cleanup() in a finally block (around line 642).
- runBuild returns results.fail with exitCode 1.
- startServer throws BuildFailedError before any handler starts.
- serve.ts and dev.ts map that error to exit code 1.
The tests pass.
<!-- SECTION:NOTES:END -->
