---
id: TASK-321
title: >-
  Give the kit bridge the registry source base so the FFI path applies real
  registries
status: Done
assignee: []
created_date: '2026-10-24 21:44'
updated_date: '2026-10-24 23:22'
labels:
  - kit
  - ajan
  - bug
dependencies: []
priority: medium
ordinal: 324000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/@eserstack/ajan/bridge_kit.go:157 passes the registry source as ApplyOptions.RegistryURL and sets no SourceBase, so kitfx reads recipe sources relative to the process cwd and the TS kit handlers' FFI path fails on real registries and falls back to the TS engine (found in TASK-250). Set SourceBase (and the GitHub endpoints) the way cmd/eser/kit.go does, and add a bridge test that applies a registry fixture through EserAjanKitApplyRecipe.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The kit bridge applies a local and an HTTP registry fixture with the same tree as eser kit add
- [x] #2 make ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25. bridge_kit.go: every ApplyRecipeChain call (apply, clone, new, update) goes through bridgeKitOptions. That helper sets SourceBase to the manifest's registryUrl, as the TypeScript kit fetches sources, plus SkipConflicts, StrictVariables and StopOnPostInstallFailure, as cmd/eser/kit.go sets them. The engine's output stays discarded; the TS handler prints from the result. Before, the bridge passed the registry source as RegistryURL with no SourceBase, so kitfx read each recipe source relative to the process's working directory and every real registry failed through the FFI path, falling back to TS. AC #1: bridge_kit_test.go TestKitBridgeAppliesRegistriesLikeTheCLI applies a registry on disk and one served over httptest through bridgeKitApplyRecipe (a requires chain, variables), checks the tree against the expected files, and checks it equals kitfx under the eser kit add options. With the rebuilt library: deno test pkg/@eserstack/kit (159 passed) and the cmd/eser kit parity test (8 cases) pass. AC #2 waits on a clean make ok; the concurrent aifx work does not compile yet.

2026-10-25: make ok and deno task cli ok passed.
<!-- SECTION:NOTES:END -->
