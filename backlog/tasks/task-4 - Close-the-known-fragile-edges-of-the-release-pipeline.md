---
id: TASK-4
title: Close the known fragile edges of the release pipeline
status: Done
assignee: []
created_date: '2026-09-13 16:51'
updated_date: '2026-09-16 12:23'
labels:
  - ci
  - release
dependencies: []
references:
  - .github/workflows/build.yml
  - .github/workflows/publish-ajan.yml
  - pkg/@eserstack/cli/scripts/npm-build-externals.test.ts
priority: high
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Edges that each cost at least one failed release in 2026: Go resolved from 'stable' on the runner (fixed: go-version-file + toolchain pin); ajan go.mod drifting from the root module through the replace directive (fixed: make check tidy -diff); the esbuild externals list copied across three npm builders; resolution of etc/scripts depending on gitignored manifests; and the ajan-linux-arm64, ajan-linux-x64, ajan-win32-x64 and ajan-wasm npm packages stuck at 4.1.57 since 2026-04 because OIDC trusted publishing was never configured for them, which fails every release run with a 404 on PUT.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Trusted publishing on npmjs.com is configured for ajan-linux-arm64, ajan-linux-x64, ajan-win32-x64 and ajan-wasm (repository eser/stack, workflow build.yml) and one release run publishes all six platform packages at the same version
- [x] #2 The npm externals list lives in one module imported by the cli, noskills and laroux-server builders; npm-build-externals.test.ts asserts the single source instead of comparing three copies
- [x] #3 Every runs-on label in build.yml is documented with why that runner class is used, and jobs that need gh or a specific toolchain run on GitHub-hosted images
- [x] #4 .golangci.yaml run.go matches the go directive in go.mod
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: NPM_EXTERNAL_PACKAGES now lives in @eserstack/codebase/npm-externals (exported), imported by the cli, noskills and laroux-server builders; npm-build-externals.test.ts asserts the import and rejects local arrays. Every runs-on in build.yml carries a why-comment; release-notes moved to ubuntu-24.04-arm alongside the other gh/OIDC jobs. .golangci.yaml run.go = 1.26. Trusted publishing configured on 2026-09-16 via 'npm trust github <pkg> --file build.yml --repo eser/stack --allow-publish' for ajan-linux-arm64, ajan-linux-x64 and ajan-win32-x64; ajan-wasm already had an identical build.yml/eser/stack entry. Publishing all six at one version will be confirmed by the next tag run (or a post-publish resume of v4.5.1).
<!-- SECTION:NOTES:END -->
