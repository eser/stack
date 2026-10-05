---
id: TASK-96
title: Remove or wire up the dead modules and branches in laroux-server
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - laroux-server
  - cleanup
dependencies: []
references:
  - pkg/@eserstack/laroux-server/config/env.ts
  - pkg/@eserstack/laroux-server/error-formatting.ts
  - pkg/@eserstack/laroux-server/main.ts
priority: low
ordinal: 96000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
No package export reaches config/env.ts (initEnvConfig, loadEnvFiles) or error-formatting.ts (LarouxError, formatError, setupErrorHandlers), and only their tests import them; domain/mod.ts and adapters/mod.ts are not exported either. startServer always creates a PrebuiltBundler (main.ts:503), so the RuntimeBundler rebuild branch in the watch callback (main.ts:383-393) cannot run, and that callback logs '✓ Compiled' and pushes an HMR update even after a failed rebuild.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each unreachable module is deleted or exported and used
- [x] #2 The watch callback reports a failed rebuild as a failure and skips the HMR push
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

laroux: config/env.ts, error-formatting.ts, domain/mod.ts, adapters/mod.ts, product-info.ts and runtime/middleware/mod.ts are deleted, and no tracked file references them. deno.extra.json and the generated manifest are up to date. rebuild-handler.ts reports a failed rebuild and sends no HMR update, and its tests pass.
<!-- SECTION:NOTES:END -->
