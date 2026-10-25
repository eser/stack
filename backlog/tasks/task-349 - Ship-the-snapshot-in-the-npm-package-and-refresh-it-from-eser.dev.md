---
id: TASK-349
title: Ship the snapshot in the npm package and refresh it from eser.dev
status: To Do
assignee: []
created_date: '2026-10-25 09:50'
labels:
  - persona
  - track-p
  - code
milestone: m-9
dependencies:
  - TASK-347
priority: high
ordinal: 352000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build the snapshot from published, listed records at release time and ship it in the eser npm package. On a network, fetch the current snapshot from eser.dev (GitHub raw until the site exists) and write a local cache. Offline, use the cache or the bundled snapshot. Drafts and unlisted records stay out.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 eser intro works offline from the bundled snapshot
- [ ] #2 A newer remote snapshot replaces the cache, and a failed fetch falls back without an error
- [ ] #3 Preflight checks the snapshot is in the packed tarball
- [ ] #4 The gate passes
<!-- AC:END -->
