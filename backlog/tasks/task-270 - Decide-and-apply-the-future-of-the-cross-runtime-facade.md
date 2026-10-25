---
id: TASK-270
title: Decide and apply the future of the cross-runtime facade
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
labels:
  - standards
  - cross-runtime
  - adr
  - skills
milestone: m-6
dependencies:
  - TASK-269
priority: low
ordinal: 270000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decision cross-runtime-facade, do one of two things. Either keep `runtime` as a thin Node and browser facade and keep the validator's process rule, or codemod the 318 runtime.* importers to node:* and Web APIs, delete the facade and drop the process rule. The facade covers TypeScript's own runtime access only: the Go bridge loads through node:ffi directly and stays either way (decision-22).

Record the choice in a new ADR in docs/adr, and update the javascript-practices and architecture-guidelines skills, ADR 0005's consequences and the README package table.

Decisions this task waits on: decision-16 (Keep the @eserstack/standards runtime facade).

Plan key: M6-T4. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A new ADR in docs/adr records the choice and names decision-16
- [ ] #2 If the facade is kept, the validate-runtime-js-apis tests cover the process rule and pass; if it is removed, `git grep -n 'cross-runtime' -- 'pkg/*.ts'` returns nothing and the process rule and its tests are deleted
- [ ] #3 The javascript-practices and architecture-guidelines skills, ADR 0005's consequences and the README package table describe the chosen state
- [ ] #4 `eser ok` passes
<!-- AC:END -->
