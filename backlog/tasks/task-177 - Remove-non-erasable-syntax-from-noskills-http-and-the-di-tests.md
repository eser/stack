---
id: TASK-177
title: 'Remove non-erasable syntax from noskills, http and the di tests'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 16:36'
labels:
  - noskills
  - http
  - di
  - erasable-syntax
milestone: m-0
dependencies: []
priority: high
ordinal: 177000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rewrite these parameter properties as declared readonly fields assigned in the constructor: noskills/context/transition-validation.ts:508, noskills/state/persistence.ts:289, noskills/state/split.ts:54 and http/adapter.ts:45-47. V8 in Node 26 has no decorator syntax, so the 5 decorator uses in di/container.test.ts:225-260 and di/decorators.test.ts:7 become direct calls to injectable() and inject(). The di README notes that the @ form needs a transform. One commit per package.

Decisions this task waits on: decision-42 (@eserstack/di decorator API).

Plan key: M0-T4. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No parameter property remains in pkg/@eserstack/noskills or pkg/@eserstack/http, and no decorator syntax remains in pkg/@eserstack/di
- [x] #2 noskills ./mod, ./dashboard, ./persistence and ./session, noskills-web '.', and http '.' and './adapter' import under plain `node` 26 from inside their packages
- [x] #3 `deno task cli ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Parameter properties rewritten as readonly fields in noskills transition-validation.ts, persistence.ts, split.ts and http/adapter.ts. di tests call injectable()(Class) and inject(key)(undefined, context) directly; the di README documents that the @ form needs a decorator transform (Deno, tsc or a bundler) and shows the function form for Node. noskills ./mod, ./main, ./dashboard, ./persistence, ./session, noskills-web '.' and http '.' and './adapter' import under node 26.5.1. Full gate: deno task cli ok passed on 2026-10-24 (34 steps).
<!-- SECTION:NOTES:END -->
