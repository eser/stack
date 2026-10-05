---
id: TASK-38
title: Replace suppressed type assertions on errors with errors.AsType
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - ajan
  - go
dependencies: []
references:
  - pkg/ajan/postsfx/twitter/client.go
  - pkg/ajan/processfx/exec.go
priority: low
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/ajan/postsfx/twitter/client.go:169,174, pkg/ajan/postsfx/bluesky/client.go:161,166 and pkg/ajan/processfx/exec.go:126 assert error types directly under //nolint:errorlint, which breaks as soon as the error is wrapped. Rule: go-practices errors-and-logging.md: Error Handling.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The sites use errors.AsType and the errorlint suppressions are gone
- [x] #2 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

go-libs-bridge: Checked in the code. The twitter and bluesky isRateLimitError/retry helpers and processfx Run use errors.AsType. No errorlint nolint is left in postsfx or processfx. Tests check that a wrapped rateLimitError is still recognized.
<!-- SECTION:NOTES:END -->
