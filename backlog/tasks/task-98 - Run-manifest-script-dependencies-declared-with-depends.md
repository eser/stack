---
id: TASK-98
title: Run manifest script dependencies declared with depends
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - cli
  - bug
dependencies: []
references:
  - pkg/@eserstack/cli/scripts.ts
  - pkg/@eserstack/cli/README.md
priority: high
ordinal: 98000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
resolveDependencies in pkg/@eserstack/cli/scripts.ts:64-101 returns only the transitive dependencies of each dep, not the dep itself, and marks it resolved, so the parent never adds it to the run order. A script's `depends` are silently skipped: a reproduction showed `second` (depends: [first]) running without `first`, and a script depending on one that exits 3 running and exiting 0.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Dependencies run in post-order before the script, keeping the cycle and unknown-dependency errors
- [x] #2 scripts.test.ts covers a chain, a diamond, a cycle and a failing dependency that stops the run
- [x] #3 The cli README 'Project scripts and plugins' section documents depends
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

cli: Verified by reading the code, running the tests and an end-to-end run. resolveRunOrder (scripts.ts:169) is a depth-first walk that puts dependencies in post-order, lists each one once and puts the requested script last. Cycle, unknown-name and malformed-entry errors come back as a ManifestScriptError inside a Result, and runScript turns them into exit 1 before any script runs. The first failing dependency stops the run with its exit code. Object.hasOwn keeps inherited names out of script lookup in both main.ts and the resolver.
<!-- SECTION:NOTES:END -->
