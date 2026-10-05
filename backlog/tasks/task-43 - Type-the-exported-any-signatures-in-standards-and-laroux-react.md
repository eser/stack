---
id: TASK-43
title: Type the exported any signatures in standards and laroux-react
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - typescript
dependencies: []
references:
  - pkg/@eserstack/standards/cross-runtime/adapters/shared.ts
priority: low
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/@eserstack/standards/cross-runtime/adapters/shared.ts:86,95 (getProcess, getNavigator return any) and pkg/@eserstack/laroux-react/client.ts:151 (ModuleLoader returns any) expose any in public signatures.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The three signatures use a concrete type or unknown with narrowing at the call sites
- [x] #2 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

laroux-react: Verified: ModuleLoader is (id, name) => unknown, loadClientModule returns Promise<unknown>, and moduleCache is Map<string, Promise<unknown>>. hydrateIsland narrows the loaded value with isComponentType before rendering it. The other paths keep the value opaque: it goes into chunk values that React reads. The getProcess/getNavigator signatures belong to the standards unit.

standards: The standards half is done: getProcess and getNavigator in pkg/@eserstack/standards/cross-runtime/adapters/shared.ts return NodeProcessInfo | null and NavigatorInfo | null, narrowed from unknown by the tested pure functions toNodeProcessInfo and toNavigatorInfo. They have no callers outside shared.ts. The laroux-react ModuleLoader signature (client.ts:151) belongs to another unit.
<!-- SECTION:NOTES:END -->
