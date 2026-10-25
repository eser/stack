---
id: TASK-133
title: 'Clean up the laroux image helpers: options object and explicit checks'
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-15 19:34'
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
- [x] #1 buildPictureSources takes { basePath, ext, formats, srcSet, sizes } and laroux-react is updated
- [x] #2 The placeholder helpers compare explicitly, with tests for blur with, without and with an empty data URL
- [x] #3 The breaking change is noted in the changelog
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in round 3 of the autonomous backlog run (2026-10-05); deno task cli ok passes.

AC #3 is met. The buildPictureSources options-object change and the quoted buildPlaceholderStyles url are in CHANGELOG Unreleased > Migration > @eserstack/laroux and in the laroux README. The example type-checks against laroux/image (PictureSourcesOptions, ParsedImageSrc). ACs #1 and #2 belong to the laroux unit.
<!-- SECTION:NOTES:END -->
