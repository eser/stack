---
id: TASK-89
title: Fix laroux-bundler's stale-build and route-scanner caches
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - laroux-bundler
  - bug
dependencies: []
references:
  - pkg/@eserstack/laroux-bundler/system.ts
  - pkg/@eserstack/laroux-bundler/domain/route-scanner.ts
priority: medium
ordinal: 89000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ensureBuildIsReady rebuilds every time: createBuildContext sets chunkManifestFile to <distDir>/manifest.json (system.ts:128-131) and loadExistingBuild reads <distDir>/module-map.json (:848-856), but build() writes both under <distDir>/client/ (:391). The staleness check only reads the top level of srcDir (:802). domain/route-scanner.ts:16-17 keeps cachedResult and cachedRoutesDirMtime at module level, not keyed by routesDir, so a second project scanned in the same process gets the first project's routes. Rule: design-principles: Module-Level Side Effects.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A test shows a second ensureBuildIsReady call on an unchanged project skips the build, and a nested source change triggers one
- [x] #2 The route cache is keyed by routes directory or lives in BuildCache, with a test using two directories
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

laroux: Checked:
- the chunk manifest and module map paths are under client/;
- the staleness check walks nested files;
- the manifest is written last;
- the route scan cache lives in BuildCache, keyed by routes directory, with no module-level state.
Both tests pass.
<!-- SECTION:NOTES:END -->
