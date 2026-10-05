---
id: TASK-144
title: >-
  Remove or implement the no-op WithMaxIdleStreams option in
  pkg/ajan/webtransport
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - webtransport
  - cleanup
dependencies: []
references:
  - pkg/ajan/webtransport/options.go
  - pkg/ajan/webtransport/config.go
priority: low
ordinal: 144000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Config.MaxIdleStreams and WithMaxIdleStreams (pkg/ajan/webtransport/config.go:25-26, options.go:42-46) are documented to cap idle streams per session, but NewClient never reads them. The functional options also cannot report an invalid value. Rules: documentation-conventions: Claims Need Evidence; go-practices: Constructors and Options.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 MaxIdleStreams maps onto a real quic-go setting with a test, or is removed
- [x] #2 Options that can be invalid return an error that NewClient reports
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

go-http: Verified: MaxIdleStreams and WithMaxIdleStreams are gone; a git grep outside backlog and etc/temp finds no reference. Option is now func(*Client) error, and NewClient returns (*Client, error) wrapping ErrInvalidOption. Tests pass.
<!-- SECTION:NOTES:END -->
