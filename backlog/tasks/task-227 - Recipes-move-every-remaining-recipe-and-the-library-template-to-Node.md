---
id: TASK-227
title: 'Recipes: move every remaining recipe and the library template to Node'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-26 10:00'
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
- [x] #1 `git grep -ni deno .eser/recipes .eser/recipes.json` returns nothing
- [x] #2 Applying library-pkg with the kit command produces a package whose test passes under node --test
- [x] #3 laroux-app builds with `laroux build` from the workspace
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1; grep and a run):
- library-pkg: mod.test.ts (2 Deno.test) fails under node with "Deno is not defined"; after the codemod it passes 2/2 (run in a scratch dir that links @eserstack/primitives and test-kit). package.json already has the test-kit devDependency.
- laroux-app: package.json:7-9 scripts are `deno run --allow-all --unstable-bundle jsr:@eserstack/cli laroux ...`; package.json:12-15 dependencies are `npm:@jsr/eser__*@^4.0.43`; laroux.config.ts:1 and src/app/routes/index.ts:5 import the nonexistent @eserstack/laroux-core; public/llms.txt (5 Deno mentions); 4 .tsx files.
- vanilla-app: main.ts:8 (a docs.deno.com link).
- .npmrc with @jsr:registry: cf-workers-app, jsx-runtime-app, laroux-app.
- .eser/recipes.json:13 (`["deno", "library", "typescript", "jsr"]`) and :262 (laroux-runtime-app, TASK-210). jsx-runtime-app (root.test.tsx, 3 mentions) and laroux-runtime-app (build.ts, 1) go in TASK-210.

TASK-198 (2026-10-25): the test and bench codemods left no site for hand edits in this task's files (0 unhandled), and none of its test files fails under `node --test --test-force-exit` on Node 26.12.1 when run alone.

TASK-227 (2026-10-26, Node 26.12.1):
- recipes.json: library-pkg tags are node, library, typescript, npm; fp-pipe's dependency is npm `@eserstack/fp`; laroux-app's npm list drops @eserstack/laroux-server; the two .npmrc entries are gone.
- Deleted laroux-app/.npmrc and cf-workers-app/.npmrc (each held only the @jsr registry line).
- library-pkg: README has an install line (`pnpm add @eserstack/package-name`) and links the npm package instead of JSR; mod.test.ts was already on node:test with test-kit (TASK-198).
- laroux-app (decision-47): scripts are `laroux dev|build|serve`; dependencies are @eserstack/laroux and @eserstack/laroux-react at ^5.0.0 (decision-29), react and react-dom ^19.3.0; devDependencies add `laroux` ^5.0.0; laroux.config.ts imports UserConfig from @eserstack/laroux/config and routes/index.ts imports RouteDefinition from @eserstack/laroux/router; llms.txt lists the node --run commands.
- vanilla-app: the docs.deno.com comment is gone and @eserstack/standards is ^5.0.0 instead of workspace:*.
- AC1: `git grep -ni deno .eser/recipes .eser/recipes.json` prints nothing.
- AC2: `kit add library-pkg --registry <manifest copy>` into etc/temp, with @eserstack/primitives and test-kit linked into its node_modules: the four files match the recipe, no deno.json, and `node --test --test-force-exit mod.test.ts` passes 2/2.
- AC3: `kit add laroux-app` the same way, with @eserstack/laroux, laroux-react, react, react-dom, tailwindcss and @types/react linked from the workspace: `node pkg/@eserstack/laroux-server/cli.ts build` exits 0 and writes dist/ (5 server files, 1 client component); the generated routes import @eserstack/laroux/router.
- Kit resolves a local manifest's files against its registryUrl (GitHub main) in both engines, so the runs used a manifest copy whose registryUrl was the worktree .eser directory. Engine follow-ups are for TASK-216.
<!-- SECTION:NOTES:END -->
