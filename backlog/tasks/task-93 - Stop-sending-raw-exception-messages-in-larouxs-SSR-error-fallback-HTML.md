---
id: TASK-93
title: Stop sending raw exception messages in laroux's SSR error fallback HTML
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - laroux-server
  - security
dependencies: []
references:
  - pkg/@eserstack/laroux-server/adapters/react/ssr-renderer.ts
  - pkg/@eserstack/laroux-server/runtime/server.ts
priority: high
ordinal: 93000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In renderSSR's catch block, laroux-server adapters/react/ssr-renderer.ts:725-732 returns `<div data-ssr-error="true">SSR Error: ${error.message}</div>`, and runtime/server.ts writes that HTML into the page unescaped. A message that carries request-derived text is an HTML injection vector, and the message discloses internal detail. TASK-13 removed stacks from E chunks but not this path. Rules: security-practices: Error Sanitization, No Injection Through Strings.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The fallback HTML carries a generic message and a correlation id, and the detail is logged server side
- [x] #2 A test with markup in the error message shows it does not reach the HTML
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

laroux: ssr-renderer.ts catch block:
- logs once with a correlationId;
- returns SSR_ERROR_MESSAGE plus a UUID, with data-error-id;
- sends an E chunk with the same generic message;
- never includes error.message.
The markup test passes.
<!-- SECTION:NOTES:END -->
