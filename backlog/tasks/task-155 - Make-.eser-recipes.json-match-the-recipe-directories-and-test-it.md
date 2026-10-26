---
id: TASK-155
title: Make .eser/recipes.json match the recipe directories and test it
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - kit
  - recipes
dependencies: []
references:
  - .eser/recipes.json
  - .eser/recipes
priority: low
ordinal: 155000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
recipes.json lists five cool-lime-app source files that do not exist (recipes/cool-lime-app/build.ts, main.ts, manifest.jsonc, manifest.yaml, pkg/app/mod.tsx), and .eser/recipes/laroux-runtime-app/ exists but is not listed. No test checks that every local source in recipes.json exists, which is how entries go stale. TASK-50 changes the library-pkg entry.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every local source in recipes.json exists and every recipe directory is listed or removed
- [x] #2 A kit test fails on a missing recipe source file
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

kit: Verified. recipes.json lists laroux-runtime-app in place of the stale cool-lime-app, and all nine recipe directories are listed. The recipe's imports resolve against real APIs: @eserstack/laroux-runtime's createRuntime, setBaseUrl, loadManifest and execute, and @eserstack/collector's buildManifest. The untracked TODO(@eser) was removed. repo-registry.test.ts checks the real registry, plus a table of fixture cases: a missing source, a file no recipe lists, a kind mismatch, OS metadata files that are ignored, and github sources that are skipped.
<!-- SECTION:NOTES:END -->
