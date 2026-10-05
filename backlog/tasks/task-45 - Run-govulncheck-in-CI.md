---
id: TASK-45
title: Run govulncheck in CI
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-09-25 21:50'
labels:
  - ci
  - security
dependencies: []
references:
  - go.mod
  - .github/workflows/build.yml
priority: high
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
govulncheck is pinned as a tool in go.mod but no Makefile target or workflow step runs it. Workflow changes need the owner's approval. Rule: release-and-ci; security-practices review checklist.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A make target and a build.yml step run go tool govulncheck ./... for both modules
- [x] #2 The owner decides whether findings fail the build or only report
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added make vuln (both modules via -C for the bridge), deno task cli go-vuln, and a 'Check Go vulnerabilities' step in the build.yml Validate job that fails on reachable findings. Raised the go.mod toolchain to go1.26.6, which fixes the 7 standard library vulnerabilities govulncheck reported on 1.26.5.
<!-- SECTION:NOTES:END -->
