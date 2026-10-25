---
id: TASK-294
title: 'laroux: /rsc/transforms for directives, ids, inline sealing, island aliases and Defer registration'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux
  - track-l
milestone: m-7
dependencies:
  - TASK-282
  - TASK-241
priority: medium
ordinal: 294000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 sections 6.1, 7.1, 8.2 and 9. Pure transforms in `/rsc/transforms`, built on @vitejs/plugin-rsc's /transforms as a dependency (decision-48), or on a vendored copy with MIT attribution if L-S1 requires it:
- directive detection that handles `export { a as b }`, re-exports, destructured and type-only exports, and the build errors of section 7.1
- ids with the flags byte and the salt rules; named inline ids
- inline "use server": hoisting, `$$hoist.bind(null, $$laroux_seal(...))` at the use site and `$$laroux_unseal` at the top of the hoisted function
- client and ssr stubs through createServerReference
- transform (i): direct client children of a non-load Island become alias references, using a resolveDirective callback
- transform (iii): Defer child registration with its owning segment and declared search params, and the Defer build errors
- the server-only and client-only import checks of section 2
Each transform takes its callbacks as parameters; laroux-server/adapters/native supplies them.

New subpaths ship beside the existing laroux exports (additive in 5.x). Rules: javascript-practices, frontend-practices, security-practices where the section touches input, keys or output.

Plan key: L4b. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Fixture tests cover every export shape, every build error, id stability across builds and the flags-byte change
- [ ] #2 A test inserts an inline action above another and the second keeps its id
- [ ] #3 Transform (i) aliases only when `when` is not statically load(), falls back with a warning when resolution fails, and leaves a reference passed as a prop value alone
- [ ] #4 The laroux README documents the new API with examples, and the gate passes
<!-- AC:END -->
