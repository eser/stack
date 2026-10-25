---
id: TASK-350
title: 'Add eser content add, stale and review'
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
priority: medium
ordinal: 353000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
eser content add <url> reads public endpoints (Bluesky AT, YouTube RSS and oEmbed, X oEmbed) and writes a social or video record. eser content stale lists records past their review interval. eser content review lists drafts. No platform login and no paid API.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Adding a Bluesky, a YouTube and an X URL each writes a valid record
- [ ] #2 stale and review list the right records on fixtures
- [ ] #3 The gate passes
<!-- AC:END -->
