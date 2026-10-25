---
id: TASK-178
title: >-
  logging: create the context store with node:async_hooks and drop parameter
  properties
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 16:36'
labels:
  - logging
  - bug
  - erasable-syntax
milestone: m-0
dependencies: []
priority: medium
ordinal: 178000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
logging/context.ts:19-24 and :40 look for globalThis.AsyncLocalStorage or globalThis.require. Neither exists on Deno or on Node ESM, so the context store is never created. Import AsyncLocalStorage from node:async_hooks, which both runtimes support. Rewrite the parameter properties in logging/serialize.test.ts:8-9.

Plan key: M0-T5. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A new test shows that context set in an async parent is visible in a nested awaited log call
- [x] #2 No globalThis.require lookup and no parameter property remain in pkg/@eserstack/logging
- [x] #3 `deno task cli ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: logging/context.ts looked for globalThis.AsyncLocalStorage or globalThis.require, which exist on neither Deno nor Node ESM, so getContextStorage returned undefined and withContext ran without a store. Now imports node:async_hooks (with a deno-lint-ignore no-external-import like standards/cross-runtime/adapters/deno.ts). New test in logger.test.ts: context set in an async parent reaches a nested awaited log call through the console fallback; it fails on the old code. serialize.test.ts parameter properties rewritten. Full gate: deno task cli ok passed on 2026-10-24 (34 steps).
<!-- SECTION:NOTES:END -->
