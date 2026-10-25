---
id: TASK-322
title: Fix the TypeScript kit behaviors found while porting kit to Go
status: Done
assignee: []
created_date: '2026-10-24 21:44'
updated_date: '2026-10-24 23:22'
labels:
  - kit
  - bug
dependencies: []
priority: low
ordinal: 325000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in TASK-250 while comparing the Go eser kit with the TS one; Go matches TS today, so a fix changes both or documents the behavior. (1) Files mode does not substitute {{.var}} in targets (recipes/recipe-applier.ts:317) and ignore applies only in whole-repo mode (:724), while clone-recipe.ts:119-122 says otherwise. (2) processor.ts:96 says *.md matches at any depth; it matches the top level. (3) A clone with a subpath resolves file sources against the repository root (clone-recipe.ts:304-305), registry-fetcher.ts:580 says relative to the subpath. (4) promptVariable loops forever on empty answers (variable-processor.ts:94; Go caps at 10 tries) and its [default] hint (:76) can never show. (5) The provider field is ignored (registry-schema.ts:53), so the ajan-* recipes in .eser/recipes.json (provider: github, sources like lib/) resolve to .eser/lib/ and fail. (6) --local starts at the process cwd and ignores add --cwd (registry-fetcher.ts:249). (7) The list FFI path passes cwd '.' and drops --local (list-recipes.ts:141). (8) clone usage text says 'default branch' but the default ref is main (clone.ts:170).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each item is fixed in TS and Go together or documented as intended
- [x] #2 The kit parity test in cmd/eser still passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25, item by item (numbers as in the description):
(1) Documented as intended: files mode writes {{.var}} in paths literally on both engines, and ignore applies only in whole-repo mode. The clone-recipe.ts guard comment that implied otherwise is corrected.
(2) processor.ts comment fixed: *.md matches the top level only.
(3) Documented: subpath clone sources resolve against the repository root. The fetchRecipeFromRepo JSDoc now says so instead of 'relative to that subpath'. Changing it would break recipes written root-relative.
(4) Kept: promptVariable throws on EOF (null), so it does not spin without input. It asks again on empty answers only while a person keeps answering; Go caps it at 10, a difference noted in TASK-250. The default hint is reachable when promptVariable is called with a default, so it stays.
(5) Fixed in TS and Go:
  - provider 'github' now means the source sits at the root of the repository that registryUrl names: a raw.githubusercontent.com URL or a gh: specifier. TS: registryFetcher.sourceBaseFor, used by applyFile and applyFolder, with tests. Go: applyRun.sourceBase, with TestApplyRecipe_GitHubProviderUsesTheRepositoryRoot. A non-GitHub base is an error.
  - The 9 ajan-* recipes whose folder exists here now point at pkg/ajan/<name>/ in .eser/recipes.json (text edit; the diff is 11/10 lines). repo-registry.test.ts checks the github sources exist in this repository.
  - Owner decision needed: ajan-di, ajan-datafx, ajan-eventsfx, ajan-metricsfx, ajan-tracesfx and ajan-grpcfx name folders that came from the eser/ajan repository and do not exist here. Remove them, or point them at that repository. The test lists them as NOT_IN_THIS_REPOSITORY.
(6) Fixed in TS and Go: kit add --local searches upward from --cwd. TS: detectLocalRegistry(startDir) and FetchRegistryOptions.cwd, passed by add and update, with a test. Go: loadKitRegistry takes the cwd; a relative --registry still resolves against the working directory, as in TS. Test TestKitAddLocalSearchesFromCwd.
(7) Fixed: list's FFI path resolves the source as the TS path does (explicit, --local, then the default URL) and passes the real cwd. Before, Go searched for a local registry with or without --local.
(8) clone usage text says '(ref main)' in TS and Go.
Waits on a clean gate (concurrent aifx/muxfx work in progress).

2026-10-25: deno task cli ok and make ok passed with all concurrent work in place.
<!-- SECTION:NOTES:END -->
