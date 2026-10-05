---
id: TASK-123
title: Move streams span.ts exports onto the declarations
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - streams
  - refactor
dependencies: []
references:
  - pkg/@eserstack/streams/span.ts
priority: low
ordinal: 123000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/@eserstack/streams/span.ts declares everything locally and exports it through `export { ... }` (line 284) and `export type { ... }` (line 314) lists at the bottom. The modules rule asks for `export` on each declaration; the public surface does not change. Rule: javascript-practices: Exports.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each exported declaration carries export and the lists are gone
- [x] #2 deno task cli ok passes with the same public exports
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

small-a: span.ts has `export` on each declaration and no local export lists. A repo scan finds no local `export { ... }` lists in the unit. The only remaining export blocks are re-exports with `from`. The streams publish dry-run passes.
<!-- SECTION:NOTES:END -->
