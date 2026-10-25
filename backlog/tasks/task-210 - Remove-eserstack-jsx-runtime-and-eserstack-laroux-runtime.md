---
id: TASK-210
title: Remove @eserstack/jsx-runtime and @eserstack/laroux-runtime
status: In Progress
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 18:00'
labels:
  - cutover
  - jsx-runtime
  - laroux-runtime
  - cleanup
milestone: m-1
dependencies:
  - TASK-198
priority: low
ordinal: 210000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decision legacy-packages, delete pkg/@eserstack/jsx-runtime and pkg/@eserstack/laroux-runtime together with their recipes (.eser/recipes/jsx-runtime-app, laroux-runtime-app) and their .eser/recipes.json entries. jsx-runtime existed for Deno's precompile JSX transform, and neither package has a consumer outside its recipe; the barrel that referenced them is already gone (M0-T9). Their published versions stay available. The integration agent updates the lockfile.

Decisions this task waits on: decision-18 (Remove @eserstack/jsx-runtime and @eserstack/laroux-runtime).

Plan key: M1-T16. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Both packages and both recipes are gone, and no import references them
- [ ] #2 `pnpm install --frozen-lockfile` works; the CHANGELOG Migration entry (M1-T36) lists the removal
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: jsx-runtime 1 of 1 (18 tests); laroux-runtime 2 of 2 (12 tests). Nothing to port: both are deleted.
- Files that name Deno: pkg/@eserstack/jsx-runtime/README.md (1), mod.ts (1), jsx-runtime.test.ts (18); pkg/@eserstack/laroux-runtime/deno.extra.json (1), primitives.test.ts (11), mod.test.ts (1); .eser/recipes/jsx-runtime-app/root.test.tsx (3; node cannot load a .tsx test) and .eser/recipes/laroux-runtime-app/build.ts (1); .eser/recipes.json:262 tags laroux-runtime-app with "deno".

TASK-198 (2026-10-25): the test and bench codemods left no site for hand edits in this task's files (0 unhandled), and none of its test files fails under `node --test --test-force-exit` on Node 26.12.1 when run alone.

TASK-210 (2026-10-25):
- Deleted pkg/@eserstack/jsx-runtime, pkg/@eserstack/laroux-runtime, .eser/recipes/jsx-runtime-app and .eser/recipes/laroux-runtime-app, and the laroux-runtime-app and jsx-runtime-app entries in .eser/recipes.json (edited as text; 22 recipes remain).
- No code imported either package. Removed them from .github/ARCHITECTURE.md (Layer 4), the README.md Libraries table, the recipe list in docs/agents/documentation-and-tooling.md, the pkg:jsx-runtime label in .github/issue-labels.yml and .github/pr-labeler.yml, and the package count in AGENTS.md (45 TypeScript packages, 38 libraries). The label sync runs with delete-other-labels, so the GitHub label goes on the next sync.
- Left for the cli owner: pkg/@eserstack/cli/README.md:185 still lists `laroux-runtime-app` and `jsx-runtime-app` under Available templates.
- docs/adr/0005-leave-deno-for-node-and-go.md:135 names the packages as a decision record and stays.
- AC #2 pending: the integration agent updates pnpm-lock.yaml and runs `pnpm install --frozen-lockfile`. Status stays In Progress until then.
- For TASK-230 (CHANGELOG Migration): @eserstack/jsx-runtime and @eserstack/laroux-runtime are removed, with the jsx-runtime-app and laroux-runtime-app recipes; their published 4.5.x versions stay available.
The integration agent regenerated pnpm-lock.yaml with `pnpm install` (260 lines removed, no jsx-runtime, laroux-runtime or koffi entry left), and `pnpm install --frozen-lockfile` passes. AC #2 also needs the CHANGELOG Migration entry, which TASK-230 (M1-T36) writes from the note added to its task file; the task stays In Progress until then.
<!-- SECTION:NOTES:END -->
