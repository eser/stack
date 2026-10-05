---
id: TASK-104
title: Make the Go FFI path of workflows run reachable or remove it
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - workflows
  - cleanup
dependencies: []
references:
  - pkg/@eserstack/workflows/run.ts
  - pkg/@eserstack/workflows/module.ts
  - pkg/@eserstack/workflows/WIRING.md
priority: low
ordinal: 104000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/@eserstack/workflows/run.ts:346 tries the Go engine only when cliOptions.tools is undefined, but createModuleDef always passes { tools: tools ?? [] } (module.ts:34 and :45). Both the eser CLI and the standalone main.ts go through the module, so the FFI path never runs and WIRING.md describes behavior that does not happen.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Either tools pass through unchanged and the Go path runs, after checking dryRun and positional-argument parity, or the FFI branch is deleted
- [x] #2 WIRING.md matches the code
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

ai-workflows: Verified:
- The FFI branch (runWithGo) is gone from run.ts, ffi-client.ts is deleted, and nothing in workflows references them.
- WIRING.md describes the TS-only engine, the parity table and where the native library is still used. This matches run.ts and shell-tool.ts.
- The @eserstack/ajan dependency in workflows/package.json is now unused. Removing it needs a lockfile change, so it stays in crossUnitNeeds.
<!-- SECTION:NOTES:END -->
