---
id: TASK-47
title: Add tests for packages without any
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - testing
dependencies: []
references:
  - pkg/ajan/workerfx/
  - pkg/@eserstack/laroux/
priority: high
ordinal: 47000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
No test files: Go pkg/ajan/workerfx (panic recovery, trigger channel), pkg/ajan/webtransport, pkg/ajan/i18nfx, pkg/ajan/api/adapters/appcontext; TS pkg/@eserstack/webtransport, laroux (router, navigation, srcset), noskills-client, app-runtime, laroux-runtime, noskills-server-worker. Rule: architecture-guidelines testing.md: What to Test.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each listed package has tests for its logic and failure paths, starting with workerfx and laroux
- [x] #2 Coverage does not drop
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

small-b1: The laroux share is done: 109 tests pass covering router, navigation, srcset, picture sources and image config. I re-ran the documented outputs (analyzeNavigation for relative, hash, external, protocol-relative, mailto and javascript: links, plus normalizePath, inferSrcSet, replaceSrcSetExtension and buildLinkConfig), and they match. The other packages listed in TASK-47 belong to other units. The laroux tests need pnpm-lock.yaml to gain the @std/assert devDependency; the lockfile importer for laroux does not have it yet.

small-b2: This unit's share is done and checked: 120 tests across webtransport, noskills-client, app-runtime, laroux-runtime and noskills-server-worker, all passing with --parallel --trace-leaks. I confirmed that the awaitAll tests catch a regression: with the old implementation, 3 tests fail. The Go packages and laroux belong to other units.

go-server: Verified that test files exist and pass with -race: workerfx (runner_test.go, registry_test.go), webtransport (export_test.go, pinning_test.go, client_test.go) and api/adapters/appcontext (appcontext_test.go). i18nfx, laroux and the TS packages belong to other units.

go-libs-bridge: pkg/ajan/i18nfx now has tests: IsRTL/Dir, NewLocalizer errors and skipped entries, T, TWithData and TemplateFuncMap. Coverage measured at 97.6%. The other listed packages belong to other units.
<!-- SECTION:NOTES:END -->
