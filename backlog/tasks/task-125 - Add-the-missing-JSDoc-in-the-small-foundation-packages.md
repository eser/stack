---
id: TASK-125
title: Add the missing JSDoc in the small foundation packages
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-15 19:34'
labels:
  - fp
  - logging
  - streams
  - cs
  - di
  - config
  - functions
  - parsing
  - docs
dependencies: []
references:
  - pkg/@eserstack/fp/mod.ts
  - pkg/@eserstack/logging/mod.ts
  - pkg/@eserstack/streams/mod.ts
  - pkg/@eserstack/cs/mod.ts
  - pkg/@eserstack/di/mod.ts
  - pkg/@eserstack/config/primitives.ts
  - pkg/@eserstack/functions/mod.ts
  - pkg/@eserstack/parsing/mod.ts
priority: low
ordinal: 125000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`deno doc --lint <pkg>/mod.ts` reports missing-jsdoc, missing-explicit-type and some private-type-ref errors: fp 74, logging 25, streams 71, cs 42, di 54, config 41, functions 11, parsing 32. The generated API reference comes from JSDoc. Rule: documentation-conventions: Docs Change With the Code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 deno doc --lint on each listed package's mod.ts reports no errors
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in round 3 of the autonomous backlog run (2026-10-05); deno task cli ok passes.

Re-ran deno doc --lint on the mod.ts of fp, logging, streams, cs, di, config, functions and parsing: all report 'Checked 1 file'. primitives/mod.ts and streams/renderers/mod.ts are also clean.
<!-- SECTION:NOTES:END -->
