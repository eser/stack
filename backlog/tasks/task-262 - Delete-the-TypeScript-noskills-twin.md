---
id: TASK-262
title: Delete the TypeScript noskills twin
status: In Progress
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-11-17 09:17'
labels:
  - noskills
  - cleanup
milestone: m-4
dependencies:
  - TASK-261
priority: medium
ordinal: 262000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove the migrated commands and modules from pkg/@eserstack/noskills, the agents git guard, go-noskills.ts (nothing imports it) and noskills/scripts/npm-build.ts. Keep only what noskills-web and `manager` need until M5, marked internal. Update the noskills README to describe the Go binary.

Plan key: M4-T7. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pkg/@eserstack/noskills holds no implementation of a command that has a Go version
- [ ] #2 The golden harness runs against Go only; the gate is green
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
With noskills/scripts/npm-build.ts gone, drop the esbuild devDependency of noskills; if cli's npm-build.ts (TASK-255) is already gone, delete @eserstack/codebase/npm-externals and npm-workspace-specifiers with their tests and exports too.

Owner decision (2026-11-17): watch, web and manager, which cmd/noskills still forwards, reach the TS CLI through the published library: the noskills launcher depends on @eserstack/noskills at the exact version and runs its tsc emit dist/main.js; npm-build.ts, the TS bundle and esbuild go. TASK-262 comes before TASK-254.

Step 1 (2026-11-17): the npm package noskills is the workspace package pkg/@eserstack/noskills-bin (laroux-bin model): bin noskills.ts on launcher.ts (generic, from scripts/npm-launcher.ts), the five noskills-<platform> optional dependencies and @eserstack/noskills at the same version, whose dist/main.js it names in NOSKILLS_TS_BUNDLE for watch, web and manager. noskills/scripts (npm-build.ts, npm-launcher.ts and its test) and the esbuild devDependency are gone; build.yml publishes noskills from the workspace after the libraries; the noskills-launcher-install preflight installs the packed closure after library-pack, and plugin-bins installs noskills like laroux. Verified: pnpm ok and pnpm preflight (17 steps).

Step 2 (2026-11-18): the golden harness runs on Go only. The five scenarios that seeded init from the recording (lifecycle, lifecycle_concerns, spec_lifecycle, hooks, hook_events) run init with a claude stub alone on PATH and the recording's command prefix, and match it from step 0, so nativeFrom, portedBy and the seeding are gone. TestRecord and the sync adapter recording record cmd/noskills and noskillsfx.SyncAll; re-recording every scenario reproduced the recordings unchanged. TestSyncAdaptersLive, the hook parity recorder, the TypeScript run-prompt builder, TestRunBinaryMatchesTypeScript and the packs comparison are deleted; their recordings stay in testdata. Next: shrink pkg/@eserstack/noskills to watch, web, manager and what noskills-web imports.
<!-- SECTION:NOTES:END -->
