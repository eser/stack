---
id: TASK-146
title: >-
  Stop ResolveAddressMiddleware from returning internal error text in its 500
  response
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - httpfx
  - security
dependencies: []
references:
  - pkg/ajan/httpfx/middlewares/resolve_address_middleware.go
priority: medium
ordinal: 146000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When lib.DetectLocalNetwork fails, for example on an unparsable forwarded address or an InterfaceAddrs error, pkg/ajan/httpfx/middlewares/resolve_address_middleware.go:50-54 answers 500 with err.Error() as the plain-text body. That sends internal error text, and the address it could not parse, to the client. Rule: security-practices: Error Sanitization.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The response is a generic 500 or 400
- [x] #2 The detail is logged once through logfx with the request context
- [x] #3 A test covers an unparsable address
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

go-http: Verified: the response is a generic 500 "Internal Server Error", and the cause is logged once with logger.ErrorContext and the request context.
<!-- SECTION:NOTES:END -->
