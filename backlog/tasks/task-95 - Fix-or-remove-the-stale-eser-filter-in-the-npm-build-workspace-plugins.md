---
id: TASK-95
title: Fix or remove the stale @eser/ filter in the npm-build workspace plugins
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - cli
  - laroux-server
  - noskills
  - build
dependencies: []
references:
  - pkg/@eserstack/cli/scripts/npm-build.ts
  - pkg/@eserstack/laroux-server/scripts/npm-build.ts
  - pkg/@eserstack/noskills/scripts/npm-build.ts
priority: low
ordinal: 95000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
createDenoWorkspacePlugin in pkg/@eserstack/cli/scripts/npm-build.ts:100, laroux-server/scripts/npm-build.ts:82 and noskills/scripts/npm-build.ts:92 resolves only specifiers matching /^@eser\//. The packages are named @eserstack/* since 9a44d099, so the onResolve hook never runs and esbuild silently resolves through the pnpm node_modules links instead.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each plugin either matches @eserstack/ and resolves through the generated deno.json exports, or is removed
- [x] #2 The npm bundles are unchanged or the difference is explained
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

cli: createDenoWorkspacePlugin and the unused DenoJson and projectRoot are removed from all three npm-build.ts files. Each passes `external: [...EXTERNAL_PACKAGES, "npm:*", "jsr:*"]` with only the import-meta-main plugin, and a comment explains that pnpm workspace links resolve the @eserstack imports. npm-build-externals.test.ts checks this external list in all three builders, and it passes. Stage 2's byte-identical bundle comparison (HEAD vs current vs fixed filter) is evidence for AC #2. I did not rebuild the bundles.
<!-- SECTION:NOTES:END -->
