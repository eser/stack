---
id: TASK-34
title: Thread context through kitfx registry fetching
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - ajan
  - go
dependencies: []
references:
  - pkg/ajan/kitfx/fetcher.go
priority: high
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/ajan/kitfx/fetcher.go:208 uses http.Get with //nolint:noctx; FetchRegistry(cwd, registryURL) takes no context, so a slow registry cannot be cancelled and has no deadline. Rule: go-practices context.md: Outbound Calls and Databases.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 FetchRegistry and its callers take ctx
- [x] #2 Requests use http.NewRequestWithContext and a client with a timeout
- [x] #3 The noctx nolint is removed
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

go-libs-bridge: Checked in the code. FetchRegistry, FetchRegistryFromRepo, FetchRecipeFile, FetchRecipeFolder, ApplyRecipe and ApplyRecipeChain take ctx. The workflow tools pass their ctx through, and the eight bridge.go call sites pass context.Background(). All HTTP goes through httpGet: http.NewRequestWithContext, an http.Client with a 30s timeout, and a 4 MiB body cap. No noctx nolint is left in kitfx. Post-install uses exec.CommandContext. There are tests for an oversized body, a cancelled fetch and a cancelled post-install.
<!-- SECTION:NOTES:END -->
