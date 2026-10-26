---
id: TASK-221
title: 'workflows: pass tests on Node'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-26 10:00'
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
- [x] #1 `node --test pkg/@eserstack/workflows` passes
- [x] #2 No Deno reference remains; tsc and oxlint are clean
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: 6 files, 6 pass, 49 tests, 0 fail. The 10 sanitizer options in engine.test.ts and 2 in composition.test.ts were dropped and nothing depended on them; the 6 windows `ignore:` in shell-tool.test.ts became `skip:`.
- Source: 0 Deno uses; import.meta.main 1 in main.ts needs no change.
- Docs and data: pkg/@eserstack/workflows/README.md (5); pkg/ajan/workflowfx/manifest_schema.json and docs/schema/manifest.json (2: the testRunner example "deno" and verifyCommand "deno task ok").

TASK-198 (2026-10-25): the test and bench codemods left no site for hand edits in this task's files (0 unhandled), and none of its test files fails under `node --test --test-force-exit` on Node 26.12.1 when run alone.

TASK-221 (2026-10-26, node 26.12.1):
- The sanitizer options were already gone and the six windows tests already use `skip:`; `node --test pkg/@eserstack/workflows` runs 6 files, 50 tests, 0 fail, and exits on its own.
- Deno references replaced in README.md, main.ts, shell-tool.ts (JSDoc and the missing-command message), engine.ts (JSDoc) and loader.test.ts (stack fixture); `grep -ri deno pkg/@eserstack/workflows` finds nothing.
- engine.test.ts: the repo-manifest dry-run test asserts at least one precommit step instead of at least 30, so it holds while TASK-200 rewrites .eser/manifest.yml.
- tsc reports no error in the package; oxlint is clean.
- Left outside the package: the "deno" and "deno task ok" examples in pkg/ajan/workflowfx/manifest_schema.json and docs/schema/manifest.json (lines 89, 103), the `deno fmt --check` hint in pkg/ajan/workflowfx/tools.go:46 and the `deno-formatter` sample in pkg/ajan/workflowfx/progress.go:18.
<!-- SECTION:NOTES:END -->
