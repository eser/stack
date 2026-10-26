---
id: TASK-49
title: Correct the Go module versioning rule in AGENTS.md
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - docs
  - release
dependencies: []
references:
  - AGENTS.md
priority: high
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
AGENTS.md says Go modules use independent git-tag versioning, but no per-module tags exist; every tag is the shared v4.x.y and the Go binary ships with the same tag push. The root module is github.com/eser/stack and the bridge is github.com/eser/ajan. The owner needs to state the intended rule.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AGENTS.md and release-and-ci state how each Go module is versioned, matching the tags and the release pipeline
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

Owner decision: the Go modules are internal and build from the shared release tag. The root module path has no /v4 suffix, so Go tooling cannot resolve the v4.x.y tags, and the bridge reaches it through a replace directive. AGENTS.md, release-and-ci (release-process.md: One Version for Every Package), docs/agents/languages-and-security.md and docs/agents/release-and-ci.md say so.
<!-- SECTION:NOTES:END -->
