---
id: TASK-30
title: Bound decompressed size and entry count in kit tarball extraction
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - security
  - kit
dependencies: []
references:
  - pkg/@eserstack/kit/recipes/tar.ts
priority: medium
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/@eserstack/kit/recipes/tar.ts:50-125 extractTarball blocks traversal and symlink escapes but has no limit on total bytes or entries, so a template fetched with gh:owner/repo can be a decompression bomb. Rule: security-practices crypto-and-files.md: Files From Untrusted Sources.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ExtractOptions has maxBytes and maxEntries with safe defaults
- [x] #2 Extraction fails with a clear error when either is exceeded
- [x] #3 Tests cover both limits
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

kit: AC #1 to #3 are met in recipes/tar.ts and recipes/tar_test.ts. AC #4 is left to the orchestrator. I also fixed root subpaths ("", "/", "."), which extracted nothing; they now extract the whole archive, and there is a test for it.
<!-- SECTION:NOTES:END -->
