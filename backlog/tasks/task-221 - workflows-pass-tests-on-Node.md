---
id: TASK-221
title: 'workflows: pass tests on Node'
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 19:38'
labels:
  - cutover
  - workflows
milestone: m-1
dependencies:
  - TASK-198
  - TASK-202
priority: medium
ordinal: 221000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Drop the 10 sanitizer overrides in engine.test.ts, keep the six windows skips in shell-tool.test.ts, and remove the deno lines from the README.

Plan key: M1-T27. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `node --test pkg/@eserstack/workflows` passes
- [ ] #2 No Deno reference remains; tsc and oxlint are clean
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: 6 files, 6 pass, 49 tests, 0 fail. The 10 sanitizer options in engine.test.ts and 2 in composition.test.ts were dropped and nothing depended on them; the 6 windows `ignore:` in shell-tool.test.ts became `skip:`.
- Source: 0 Deno uses; import.meta.main 1 in main.ts needs no change.
- Docs and data: pkg/@eserstack/workflows/README.md (5); pkg/ajan/workflowfx/manifest_schema.json and docs/schema/manifest.json (2: the testRunner example "deno" and verifyCommand "deno task ok").
<!-- SECTION:NOTES:END -->
