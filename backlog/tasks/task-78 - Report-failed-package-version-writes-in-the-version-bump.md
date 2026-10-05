---
id: TASK-78
title: Report failed package version writes in the version bump
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - codebase
  - bug
dependencies: []
references:
  - pkg/@eserstack/codebase/versions.ts
priority: medium
ordinal: 78000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
updateVersions in pkg/@eserstack/codebase/versions.ts calls pkg.updateVersion for the root (line 283) and for every module (line 300) and ignores the returned result. updateField records each write error in `failed`, so a package whose package.json or deno.json could not be written is still reported as updated and the bump looks complete. Rules: coding-practices: Ignored Errors, Actionable Error Messages.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A failed write makes the bump fail with each file path and reason
- [x] #2 A test with an unwritable package file covers it
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

codebase: versions() collects UpdateResult.failed from the root and every module, throws VersionWriteError (with targetVersion and failures) before VERSION is written, and the message lists each path with its reason. Rerunning with the explicit target version, as the message says, is correct because the root manifest already holds that version. The versions CLI maps the error to exit code 1, and release.ts stops before the changelog, commit and tag.
<!-- SECTION:NOTES:END -->
