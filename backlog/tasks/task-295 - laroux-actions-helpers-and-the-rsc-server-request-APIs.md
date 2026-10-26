---
id: TASK-295
title: 'laroux: /actions helpers and the /rsc/server request APIs'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux
  - track-l
milestone: m-7
dependencies:
  - TASK-283
  - TASK-293
priority: medium
ordinal: 295000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 sections 7.2, 7.3, 7.5 to 7.8 and 11.
- `/actions`: defineAction (state mode, input, output, errors, use, limits, timeoutMs, concurrency, bound, accept, headerless, allowDocumentResponse, noJs, echo, usesPrevState), defineQuery with a static cache scope and the FormData-argument rule, defineMiddleware with pre and post phases shared by actions, queries, route.ts and Defer, ActionError and its 38 codes plus typed data, isActionError, isInputError, safe, withOptions, initialActionState, actionUrl and structural formDataToObject.
- `/rsc/server`: getRequest, headers, cookies (mutable only in actions, route handlers and proxy.ts), locals, clientAddress, preferredLocales, cspNonce, setStatus, responseHeaders; redirect, permanentRedirect, notFound, forbidden, unauthorized; refresh, revalidatePath, revalidateTag, updateTag, cached; after; bindSealed, getActionResult with the PRG flash, callAction, getActionContext; the re-exported React taint APIs.
- Public-scope rules: cookies(), headers(), session() and undeclared search params throw in public queries.

New subpaths ship beside the existing laroux exports (additive in 5.x). Rules: javascript-practices, frontend-practices, security-practices where the section touches input, keys or output.

Plan key: L4c. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tests cover state mode (expected errors returned, unexpected thrown, a raw Response refused), output validation, typed error data and the client status-to-code mapping
- [ ] #2 A test shows a public query that calls cookies() throws, and a query with a File argument gets 415
- [ ] #3 A test shows one defineMiddleware runs for an action, a route.ts handler and a Defer target
- [ ] #4 Tests cover the PRG flash under and over the 2 KB cap
- [ ] #5 The laroux README documents the new API with examples, and the gate passes
<!-- AC:END -->
