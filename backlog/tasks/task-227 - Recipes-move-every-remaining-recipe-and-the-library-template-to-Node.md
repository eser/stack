---
id: TASK-227
title: 'Recipes: move every remaining recipe and the library template to Node'
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 19:38'
labels:
  - cutover
  - recipes
  - frontend
milestone: m-1
dependencies:
  - TASK-198
  - TASK-210
priority: medium
ordinal: 227000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update the recipes:
- library-pkg, the template for every new package: node:test in mod.test.ts with @eserstack/test-kit, the devDependency on test-kit, and its README install line.
- laroux-app: scripts become `laroux dev|build|serve`, and dependencies become @eserstack/* semver. Fix the nonexistent @eserstack/laroux-core imports (laroux.config.ts:1, src/app/routes/index.ts:5) and rewrite public/llms.txt.
- vanilla-app: drop the docs.deno.com link.
- Remove the recipe .npmrc @jsr lines where no @jsr dependency remains, and the 'deno' tags in .eser/recipes.json.

Decisions this task waits on: decision-18 (Remove @eserstack/jsx-runtime and @eserstack/laroux-runtime).

Plan key: M1-T33. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `git grep -ni deno .eser/recipes .eser/recipes.json` returns nothing
- [ ] #2 Applying library-pkg with the kit command produces a package whose test passes under node --test
- [ ] #3 laroux-app builds with `laroux build` from the workspace
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1; grep and a run):
- library-pkg: mod.test.ts (2 Deno.test) fails under node with "Deno is not defined"; after the codemod it passes 2/2 (run in a scratch dir that links @eserstack/primitives and test-kit). package.json already has the test-kit devDependency.
- laroux-app: package.json:7-9 scripts are `deno run --allow-all --unstable-bundle jsr:@eserstack/cli laroux ...`; package.json:12-15 dependencies are `npm:@jsr/eser__*@^4.0.43`; laroux.config.ts:1 and src/app/routes/index.ts:5 import the nonexistent @eserstack/laroux-core; public/llms.txt (5 Deno mentions); 4 .tsx files.
- vanilla-app: main.ts:8 (a docs.deno.com link).
- .npmrc with @jsr:registry: cf-workers-app, jsx-runtime-app, laroux-app.
- .eser/recipes.json:13 (`["deno", "library", "typescript", "jsr"]`) and :262 (laroux-runtime-app, TASK-210). jsx-runtime-app (root.test.tsx, 3 mentions) and laroux-runtime-app (build.ts, 1) go in TASK-210.
<!-- SECTION:NOTES:END -->
