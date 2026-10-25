---
id: TASK-108
title: Fix the moduleDef private-type-ref in every CLI package's module.ts
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-15 19:34'
labels:
  - shell
  - docs
dependencies: []
references:
  - pkg/@eserstack/workflows/module.ts
  - pkg/@eserstack/kit/module.ts
  - pkg/@eserstack/shell/module.ts
priority: low
ordinal: 108000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
deno doc --lint reports that the public moduleDef references the private type Module from @eserstack/shell/module, for example pkg/@eserstack/workflows/module.ts:53 and kit/module.ts:11. The same export exists in ai, codebase, kit, laroux-server, noskills, posts and workflows. Rule: documentation-conventions: Docs Change With the Code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each module.ts re-exports the Module type or annotates moduleDef so doc lint passes
- [x] #2 deno doc --lint on each module.ts reports no private-type-ref
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in round 3 of the autonomous backlog run (2026-10-05); deno task cli ok passes.

Verified: all seven module.ts files (ai, codebase, kit, laroux-server, noskills, posts, workflows) declare `/** ... */ export type Module = module.Module;` and `export const moduleDef: Module = new module.Module(...)`; workflows' createModuleDef returns Module. deno doc --lint on each module.ts: 'Checked 1 file', no errors. The ai, kit and noskills mod.ts files still report moduleDef -> Module because they re-export moduleDef without the alias. Those files are outside this unit and the AC targets module.ts, so it is listed in crossUnitNeeds.
<!-- SECTION:NOTES:END -->
