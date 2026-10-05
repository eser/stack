---
id: TASK-136
title: Remove or export app-runtime's checkMinDenoVersion
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - app-runtime
  - cleanup
dependencies: []
references:
  - pkg/@eserstack/app-runtime/version-checker.ts
priority: low
ordinal: 136000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/@eserstack/app-runtime/version-checker.ts:6 defines checkMinDenoVersion, but the file is not in the package exports and nothing imports it. Its name says Deno while it compares runtime.version on whatever runtime runs it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The file is deleted, or exported under a runtime-neutral name with a test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

small-b: Checked: version-checker.ts is deleted. A git grep finds no reference to checkMinDenoVersion outside backlog and etc/temp, and deno check on app-runtime passes.
<!-- SECTION:NOTES:END -->
