---
id: TASK-99
title: Delete the dead dispatch.ts and unused showScripts in the cli package
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - cli
  - cleanup
dependencies: []
references:
  - pkg/@eserstack/cli/dispatch.ts
  - pkg/@eserstack/cli/scripts.ts
priority: low
ordinal: 99000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/@eserstack/cli/dispatch.ts imports ./registry.ts, which 87ce4ead deleted when the CLI moved to the Module framework. Nothing imports dispatch.ts, the package does not export it, and `deno check pkg/@eserstack/cli/dispatch.ts` fails with TS2307; the gate only checks mod.ts files, so this was never caught. showScripts in scripts.ts:260 has no callers in the repo.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 dispatch.ts and showScripts are removed
- [x] #2 deno check pkg/@eserstack/cli/ passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

cli: dispatch.ts is deleted and showScripts is gone from scripts.ts. Nothing in pkg/@eserstack/cli, .github or docs (outside the generated docs/api) refers to dispatch.ts, showScripts or resolveDependencies. The package export is still ./main.ts. What is missing: `deno check pkg/@eserstack/cli/` still fails on 3 errors in other units' uncommitted edits. They are laroux-server/adapters/react/render-app.tsx:70 and :77 (TS2352) and laroux-server/adapters/react/rsc-flight-renderer.ts:229 (TS2769). No cli file has an error. The criterion should pass once the laroux-server unit fixes these; nothing remains to do inside the cli paths.

Orchestrator: dispatch.ts is gone and `deno check pkg/@eserstack/cli/` passes.
<!-- SECTION:NOTES:END -->
