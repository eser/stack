---
id: TASK-346
title: Build the shortcut index and its cached lookup
status: To Do
assignee: []
created_date: '2026-10-25 09:50'
labels:
  - persona
  - track-p
  - code
milestone: m-9
dependencies:
  - TASK-344
priority: medium
ordinal: 349000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The @eserstack/content package builds a shortcut to slug map from published records. The CLI caches it on disk and refreshes it when the snapshot changes. A shortcut and a full slug both resolve; an unknown name returns a clear error with near matches.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Lookup by shortcut and by slug returns the same record
- [ ] #2 The cache is rebuilt when the snapshot changes and survives a missing cache directory
- [ ] #3 The gate passes
<!-- AC:END -->
