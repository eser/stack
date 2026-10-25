---
id: TASK-122
title: Drop the default exports from @eserstack/fp and @eserstack/events
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-15 19:34'
labels:
  - fp
  - events
  - breaking
dependencies: []
references:
  - pkg/@eserstack/fp/curry.ts
  - pkg/@eserstack/events/events.ts
  - pkg/@eserstack/events/mod.ts
priority: low
ordinal: 122000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
51 fp modules end with `export { name as default };` (for example fp/curry.ts), and events/mod.ts:19 re-exports `default` from events/events.ts:12. The modules rule forbids default exports outside framework entry points. Both are breaking changes: consumers move from `import curry from "@eserstack/fp/curry"` and `import events from "@eserstack/events"` to namespace imports. Rule: javascript-practices: Exports.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No default export remains in fp or events
- [x] #2 The migration is written in the changelog for the next major release
- [x] #3 deno task cli ok and the publish dry-run pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in round 3 of the autonomous backlog run (2026-10-05); deno task cli ok passes.

The CHANGELOG Unreleased > Migration section has the before/after example for the fp, events and di default exports.
<!-- SECTION:NOTES:END -->
