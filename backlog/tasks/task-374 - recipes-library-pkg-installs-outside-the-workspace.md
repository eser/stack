---
id: TASK-374
title: 'recipes: a library-pkg copy installs outside the workspace'
status: Done
assignee: []
created_date: '2026-11-07 16:30'
labels:
  - kit
  - bug
milestone: m-2
dependencies: []
priority: medium
ordinal: 377000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
.eser/recipes/library-pkg/package.json:12 depends on the private `@eserstack/test-kit` (pkg/@eserstack/test-kit/package.json:4), and the CHANGELOG Recipes migration step said to replace `workspace:*` with `^5.0.0`, which cannot install because test-kit is never published. Found during TASK-241.

Read how the recipe is meant to be used (inside this monorepo or by outside users), what its test file imports, and how the rule "tests import from @eserstack/test-kit" applies to it. Fix the recipe or correct the CHANGELOG step, whichever is right, and say why in the notes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A package scaffolded the way the migration step documents installs and its test passes, verified in a temp directory under etc/temp with a local tarball or a registry dry check, so that nothing is published
- [x] #2 `pnpm ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause (lines at 4665f99e): CHANGELOG.md:2130-2131 told a user outside the workspace to replace every `workspace:*` with `^5.0.0`. That holds for `@eserstack/primitives` (.eser/recipes/library-pkg/package.json:9) and not for `@eserstack/test-kit` (package.json:12), which is `private: true` (pkg/@eserstack/test-kit/package.json:4) and which the publish job leaves out (docs/agents/release-and-ci.md, Libraries). `npm view @eserstack/test-kit version` answers E404. mod.test.ts:4 imports it, so removing the dependency alone is not enough either.

Why the CHANGELOG step changes and the recipe stays:

- The recipe's purpose is the workspace. docs/agents/documentation-and-tooling.md, Package templates, and AGENTS.md name it the template for a new `@eserstack/*` package, .eser/recipes.json:10 describes it as "Workspace library package", and tooling-standards repo-conventions.md says it lists test-kit as a devDependency. TASK-227 put test-kit there on purpose, and TASK-344 starts from it.
- The test-kit rule (AGENTS.md, decision-3, ADR 0005) governs tests in this repository: it keeps one seam over the assertion library here. It cannot reach an outside package, which has no way to get the private package. So the recipe's test keeps following the rule for the case the recipe is for.
- Rewriting the recipe's test to `node:assert/strict` would make every new package in this repository start in violation of that rule, in exchange for one edit fewer outside it. A user outside the workspace already has to edit the `workspace:*` range and the `@eserstack/package-name` name, so the extra edits belong with those.
- Publishing test-kit would undo decision-3's private seam and add a public API; adding an outside-only recipe is a second template to keep in step for the same four files. Neither is needed.

Changes:

- CHANGELOG.md, Recipes entry: says why test-kit is out of reach and gives the edits: `package.json` with `^5.0.0`, without the test-kit devDependency, with your own name (the whole file is shown), and `mod.test.ts` on `node:assert/strict` with `assert.ok` and `assert.equal`. The workspace description and the `greet` migration are unchanged.
- docs/agents/documentation-and-tooling.md, Package templates: records that the recipe stays a workspace template and where the outside edits live.
- pkg/@eserstack/kit/recipes/repo-registry.test.ts: "the CHANGELOG library-pkg step names each recipe dependency npm never gets" reads the recipe's `workspace:*` dependencies, keeps the ones whose workspace package is private, and requires the step to say to remove each. It failed before the CHANGELOG edit (`remove \`@eserstack/test-kit\`` not in the step) and passes after it. It matches that wording, so a later rewrite of the step has to keep it or change the test; rewording the step to "drop" made it fail again, which confirmed the final form of the test still detects the gap. The recipe itself is unchanged.

Verified in etc/temp/task-374, removed afterwards, nothing published:

- Scaffold: `eser kit new library-pkg --name my-lib --registry <manifest copy>`, built from cmd/eser, with the manifest's registryUrl pointing at a copy of the recipes (kit reads files from registryUrl, TASK-227). It wrote the four recipe files.
- Package source: `pnpm run build` and `pnpm pack` of @eserstack/primitives, repacked as 5.0.0 because the worktree is at 4.5.2, served by a local stand-in registry on 127.0.0.1 that answers 404 for every other name, as npm does for test-kit. So `^5.0.0` resolved with no override and the documented `package.json` was used as written.
- Old step, as written: `npm install` E404 and `pnpm install` ERR_PNPM_FETCH_404, both for `@eserstack/test-kit`.
- New step, followed from the CHANGELOG text: `pnpm install --ignore-workspace` (etc/temp is inside the repository's workspace) and `npm install` both installed primitives 5.0.0, and `node --test` passed 2 of 2 with each. `tsc --noEmit --strict` on the edited mod.test.ts reported nothing, so `assert.ok` still narrows the `Result`.

Not verified: the install against the real npm registry, since no 5.0.0 of @eserstack/primitives exists there yet (`npm view @eserstack/primitives version` answers E404 today).

No recipe file changed. No other recipe has this problem: `git grep workspace: .eser/recipes` and `git grep test-kit .eser/recipes` list library-pkg only.

`pnpm ok` (go run ./cmd/eser ok) in this worktree on 2026-11-07: all 34 steps passed, "All checks passed!", Go included.
<!-- SECTION:NOTES:END -->
