---
id: TASK-187
title: Remove Deno-only specifiers and pragmas from sources
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 17:40'
labels:
  - tooling
  - specifiers
milestone: m-0
dependencies:
  - TASK-186
  - TASK-185
priority: medium
ordinal: 187000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Clean up three Deno-only spots:
- In etc/scripts/dist-utils.test.ts:7 and etc/scripts/package-export-roots.test.ts:7, replace `jsr:@std/assert@^1.0.16` with `@eserstack/test-kit/assert`. That resolves through the root devDependency that M0-T17 adds.
- Remove the `// @ts-types=` pragma in jsx-runtime/mod.ts:3.
- In .eser/recipes/laroux-runtime-app/pkg/app/mod.tsx:3, replace `npm:react` with a bare specifier plus a package.json dependency.

Decisions this task waits on: decision-2 (What the root package.json may carry).

Plan key: M0-T12. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `git grep -nE "from ['\"](jsr|npm):"` returns nothing
- [x] #2 No @ts-types pragma remains
- [x] #3 Both etc/scripts tests pass under `deno task cli ok`, and their imports resolve under `node` from the repo root
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24. The two etc/scripts tests already import @eserstack/test-kit/assert since TASK-186, which also dropped their deno-lint-ignore and added the root devDependency. Removed the @ts-types pragma in jsx-runtime/mod.ts (deno check still passes; @types/react is a devDependency). The laroux-runtime-app recipe imports bare react, and its recipe entry in .eser/recipes.json lists react as an npm dependency (the recipe has no package.json of its own; kit installs the listed dependencies). git grep -nE "from ['\"](jsr|npm):" now matches only the code examples in docs/adr/0004, an accepted ADR that shows those specifiers as the wrong form and is not rewritten. Both etc/scripts tests pass in the gate, and under plain node from the repo root their imports resolve (the only error is Deno.test being undefined). deno task cli ok passed.
<!-- SECTION:NOTES:END -->
