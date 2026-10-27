---
id: TASK-362
title: >-
  kit: apply local recipe files from the working tree and pass --local on the
  native path
status: Done
assignee: []
created_date: '2026-10-25 21:09'
updated_date: '2026-10-27 12:00'
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
- [x] #1 A local manifest applies its local-provider files from the manifest's directory in both the TypeScript and the Go engine, with a test for each
- [x] #2 add-recipe.ts passes local to the native apply, and the native path prints the same dependency instructions as the TypeScript path
- [x] #3 Recipe dependencies can name dev dependencies, and laroux-app lists laroux as one
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root causes (lines at 1edd0607):

- TypeScript engine: recipes/handlers/add-recipe.ts:240 (and new-project.ts, update-recipe.ts) passed only `registryUrl: manifest.registryUrl` to the applier, and recipe-applier.ts:344 and :368 fetched every local-provider file and folder over HTTP from that URL. Nothing kept where the manifest was read from.
- Go engine: cmd/eser/kit.go:141 dropped the source that kitfx.LoadRegistry returns, and :266, :511 and :586 set `SourceBase = manifest.RegistryURL`. The bridge did the same (bridge_kit.go:398).
- Native path: add-recipe.ts:112-122 sent no `local`, and bridge_kit.go:150 loaded with kitfx.FetchRegistry, which takes the nearest local manifest whenever one exists and fails without one, so `local` had no effect. The bridge answered no dependency information (bridge_kit.go:168), and add-recipe.ts:178 filled in an empty depInfo, so nothing printed.
- RecipeDependencies (registry-schema.ts, kitfx types.go) had no dev-dependency kind.

Fixes:

- TypeScript: `registryFetcher.loadRegistry()` returns the manifest, its source and `sourceDir`, the manifest's directory for a manifest read from a file; `fetchRegistry()` delegates to it. `ApplyOptions.sourceDir` makes the applier read local-provider files and folders from disk (a folder copies the files directly in it, sorted, as the GitHub listing and the Go engine do). github-provider files still resolve against the repository that registryUrl names. add, new and update pass it.
- Go: `kitfx.SourceBaseFor(manifest, source)` returns the manifest's directory for a manifest on disk and the registryUrl otherwise. `LoadRegistry` returns the path it read (a relative Source joined with CWD). A github-provider file resolves against the repository root of SourceBase, or else of RegistryURL, so a local manifest's github files still come from GitHub. kit add, new and update use it.
- Bridge: kitApplyRecipe takes `local`, loads through kitfx.LoadRegistry (a relative registryUrl path resolves against the process's working directory, as in the TypeScript kit), sets SourceBase with SourceBaseFor, and answers `depInfo` (instructions and warnings, the project type read before the files are written). add-recipe.ts passes `local`, prints the warnings, and installs or prints the instructions on both paths through the same helpers.
- `dependencies.npmDev` (TypeScript `npmDev`, Go `NPMDev`) installs with `npm install --save-dev`, after npm. The laroux-app recipe lists `laroux` in it.

Tests: kitfx TestApplyRecipe_LocalManifestUsesItsDirectory, TestSourceBaseFor_RemoteManifest, TestGetDependencyInstructions_NPMDevDeps; bridge TestKitBridgeAppliesTheWorkingTreeOfALocalManifest; cmd/eser TestKitAddLocalAppliesTheWorkingTree (fails with the old SourceBase wiring: it fetched the unreachable registryUrl); TypeScript loadRegistry tests in registry-fetcher.test.ts, "applyRecipe: sourceDir" in recipe-applier.test.ts, npmDev in dependency-resolver.test.ts and registry-schema.test.ts, and "addRecipe: a local registry" in add-recipe.test.ts, which runs on the native library when it loads.

Left as found: the bridge's kitNewProject and kitUpdateRecipe still load with kitfx.FetchRegistry and resolve files against registryUrl, and new-project.ts and update-recipe.ts send no `local` on the native path. The same fix applies there; it needs a decision on where `new` starts the local search (the target directory does not exist yet).

The `jsr` dependency kind (registry-schema.ts:62, dependency-resolver.ts:31 and :122-126, and its Go twin kitfx deps.go:82-84) still installs with `deno add`, and no recipe uses it. decision-12 lists the kitfx `deno add` hints (deps.go) among the features kept for users whose projects use Deno, which covers this kind, so it stays; nothing was removed.
<!-- SECTION:NOTES:END -->
