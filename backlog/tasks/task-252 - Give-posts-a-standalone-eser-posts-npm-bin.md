---
id: TASK-252
title: Give posts a standalone eser-posts npm bin
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
labels:
  - posts
  - npm
  - cli
milestone: m-3
dependencies:
  - TASK-232
  - TASK-245
priority: high
ordinal: 252000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
posts has no standalone npm bin today; it ships inside the eser bundle. Per decision posts-future, add `bin: { "eser-posts": "./dist/main.js" }` to the posts package on the M2-T1 emit, with the posts CLI entry it needs. Check the existing bins: laroux keeps `laroux` and noskills keeps `noskills`. This lands before M3-T11, so the Go eser can forward to all three from the first release.

Decisions this task waits on: decision-28 (posts in Go or as a Node plugin).

Plan key: M3-T13. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The packed posts package installs an `eser-posts` bin that runs `--help` on Node 26
- [ ] #2 The Go eser forwarding test resolves eser-posts, laroux and noskills from packed packages
- [ ] #3 The posts README documents both `eser posts` and `npx -p @eserstack/posts eser-posts`
<!-- AC:END -->
