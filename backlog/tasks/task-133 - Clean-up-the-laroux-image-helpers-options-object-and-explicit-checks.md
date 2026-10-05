---
id: TASK-133
title: 'Clean up the laroux image helpers: options object and explicit checks'
status: To Do
assignee: []
created_date: '2026-10-04 20:51'
labels:
  - laroux
  - refactor
dependencies: []
references:
  - pkg/@eserstack/laroux/image/picture-sources.ts
  - pkg/@eserstack/laroux/image/placeholder.ts
priority: low
ordinal: 133000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
buildPictureSources(basePath, originalExt, formats, srcSet?, sizes?) in pkg/@eserstack/laroux/image/picture-sources.ts:21-27 takes five positional arguments, two of them optional strings that are easy to swap; changing it to an options object breaks laroux-react image.tsx and external callers. buildPlaceholderStyles uses `!blurDataURL` and shouldShowPlaceholder uses `Boolean(blurDataURL)` (placeholder.ts:21, :43). Rules: coding-practices: Explicit Checks; architecture-guidelines: Public API and CLI Surface.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 buildPictureSources takes { basePath, ext, formats, srcSet, sizes } and laroux-react is updated
- [ ] #2 The placeholder helpers compare explicitly, with tests for blur with, without and with an empty data URL
- [ ] #3 The breaking change is noted in the changelog
<!-- AC:END -->
