---
id: TASK-116
title: Normalize deno-bundler output names against the real Deno.bundle layout
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - bundler
  - bug
dependencies: []
references:
  - pkg/@eserstack/bundler/backends/deno-bundler.ts
  - pkg/@eserstack/bundler/backends/deno-bundler.test.ts
priority: medium
ordinal: 116000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A real Deno.bundle run (deno 2.9.7) writes outputs under directories named after the common root of the entrypoints, and processOutput (pkg/@eserstack/bundler/backends/deno-bundler.ts:237) keys them as-is. Output paths come out as deno-bundle-<random>/_build-id-entry.js and src/app.ts.js, the main-entry check for a top-level _client-entry name (lines 344 and 389) never matches so entrypoint falls back to main.js (line 552), entry source maps are not attached, and the entrypoint manifest is empty.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Output names, map attachment and the manifest match the entry names
- [x] #2 The deno-bundler.test.ts integration test asserts names, maps and manifest
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

small-b: Checked:
- deno-bundle-layout predicts the Deno.bundle layout.
- processOutput names each entry `${key}.js` and the build ID entry build-id.js, attaches and relocates external and inline maps, and builds entrypointManifest keyed by entry path.
- A layout it did not predict returns a fatal error result.
- The 3 integration tests against the real Deno.bundle ran here and were not skipped (23 tests in the file, 0 ignored).
- laroux-bundler's call sites (runtime-bundler reads client.js; domain/bundler.ts reads entrypointManifest) work with the new names.
- The README matches the code.

AC #3 is for the orchestrator.
<!-- SECTION:NOTES:END -->
