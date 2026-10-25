---
id: TASK-362
title: >-
  kit: apply local recipe files from the working tree and pass --local on the
  native path
status: To Do
assignee: []
created_date: '2026-10-25 21:09'
labels:
  - kit
  - bug
dependencies: []
priority: medium
ordinal: 365000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while moving the recipes to Node (TASK-227). Both kit engines resolve the local-provider files of a local manifest against its registryUrl (GitHub main), not against the manifest's own directory, so `kit add --local` or `--registry .eser/recipes.json` applies the files published on main instead of the working tree; a run wrote the old deno.json and Deno.test files from main into a scratch project. On the native path, recipes/handlers/add-recipe.ts does not pass `local` to EserAjanKitApplyRecipe, and the bridge returns an empty depInfo, so no dependency instructions print when the native library loads. The npm instruction list also has no dev-dependency kind, so the laroux-app recipe cannot list laroux as a devDependency. The `jsr` dependency kind still installs with deno add; no recipe uses it now (registry-schema.ts:62, dependency-resolver.ts:31 and :122-126), and decision-12 decides whether it stays.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A local manifest applies its local-provider files from the manifest's directory in both the TypeScript and the Go engine, with a test for each
- [ ] #2 add-recipe.ts passes local to the native apply, and the native path prints the same dependency instructions as the TypeScript path
- [ ] #3 Recipe dependencies can name dev dependencies, and laroux-app lists laroux as one
<!-- AC:END -->
