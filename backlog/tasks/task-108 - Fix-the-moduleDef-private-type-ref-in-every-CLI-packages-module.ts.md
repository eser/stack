---
id: TASK-108
title: Fix the moduleDef private-type-ref in every CLI package's module.ts
status: To Do
assignee: []
created_date: '2026-10-04 20:51'
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
- [ ] #1 Each module.ts re-exports the Module type or annotates moduleDef so doc lint passes
- [ ] #2 deno doc --lint on each module.ts reports no private-type-ref
<!-- AC:END -->
