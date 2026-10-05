---
id: TASK-42
title: Replace wildcard export * re-exports with curated exports
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - typescript
  - modules
dependencies: []
priority: low
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
46 `export * from` lines in 18 files re-export whole modules, which the modules rule forbids because shared names collide (TS2308) and the public surface is hidden. Namespace re-exports (`export * as x`) are fine. Rule: javascript-practices modules.md: Avoid Re-exports.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No `export * from` remains in pkg/@eserstack
- [x] #2 Public exports stay the same (deno task cli check and publish dry-run pass)
- [x] #3 A validate-code-conventions rule or lint check prevents new ones
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

codebase: Only the prevention rule belongs to this unit. The export-star rule flags `export * from` and `export type * from`, including across lines, and allows `export * as x from`. It ignores comments and strings and has tests and baseline support. A grep over pkg/@eserstack finds no `export * from`, and deno publish --dry-run for this package succeeds.

posts: Done for pkg/@eserstack/posts: the 18 `export * from` lines are now curated named and type re-exports. An independent HEAD-vs-current deno doc symbol comparison of all 6 changed barrels is identical. deno check passes now; it is no longer blocked by standards. deno publish --dry-run succeeds with no slow-type warnings. AC#3 (a validator rule against new `export *`) belongs to the codebase unit, so the task stays partial.

small-a: Verified: config/mod.ts, config/business/mod.ts, parsing/mod.ts and parsing/business/mod.ts use curated named re-exports that cover every export of the source modules. No `export * from` remains in the unit's paths, and deno check passes for config and parsing. AC #1 also depends on the other units' packages. AC #3 (the validator rule) is owned by pkg/@eserstack/codebase.

small-b1: This unit's share is done and verified. No `export * from` remains in the 12 packages. I checked the named re-exports in crypto/mod.ts, crypto/business/mod.ts, formats/mod.ts, formats/business/mod.ts, httpclient/mod.ts and mux/engine/mod.ts against each source module's exports (including httpclient types.ts re-exporting Fail/Ok/Result), and they cover the full surface. AC#1 for the whole repo depends on other units, and AC#3 needs a rule in pkg/@eserstack/codebase.

small-b2: This unit's share is done and checked. In noskills-client/mod.ts and webtransport/mod.ts, the `export *` lines are now curated named re-exports. A name-by-name check shows that all 43 exports of noskills-client's source modules and all 4 of webtransport's are re-exported. AC#3 belongs to the codebase unit.
<!-- SECTION:NOTES:END -->
