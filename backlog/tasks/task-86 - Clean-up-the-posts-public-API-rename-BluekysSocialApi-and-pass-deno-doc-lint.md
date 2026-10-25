---
id: TASK-86
title: >-
  Clean up the posts public API: rename BluekysSocialApi and pass deno doc
  --lint
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-15 19:34'
labels:
  - posts
  - docs
dependencies: []
references:
  - pkg/@eserstack/posts/adapters/bluesky/social-api.ts
  - pkg/@eserstack/posts/adapters/mod.ts
  - pkg/@eserstack/posts/application/handlers.ts
priority: low
ordinal: 86000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
adapters/bluesky/social-api.ts:40 exports the class as BluekysSocialApi, and adapters/cli/wiring.ts:84, adapters/mod.ts:48 and adapters/bluesky/mod.ts:11 use the misspelled name. `deno doc --lint pkg/@eserstack/posts/mod.ts` reports 104 errors: missing JSDoc, missing return types and 27 private-type-ref errors (the handler input types behind BoundTriggers, Result and Task from other packages, and the handle and postId brand symbols). Rule: documentation-conventions: Docs Change With the Code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The class is BlueskySocialApi, with a deprecated BluekysSocialApi alias for one release
- [x] #2 deno doc --lint pkg/@eserstack/posts/mod.ts reports no errors
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in round 3 of the autonomous backlog run (2026-10-05); deno task cli ok passes.

Only AC #2 is in this unit. `deno doc --lint pkg/@eserstack/posts/mod.ts` reports no errors after the Ok/Fail JSDoc in primitives/results.ts. AC #1 (BlueskySocialApi) is not in this unit.

AC #1: BluekysSocialApi stays only as a deprecated alias of BlueskySocialApi (deprecation first, release-and-ci: Breaking Changes); AC #2 met after the primitives Ok/Fail JSDoc.
<!-- SECTION:NOTES:END -->
