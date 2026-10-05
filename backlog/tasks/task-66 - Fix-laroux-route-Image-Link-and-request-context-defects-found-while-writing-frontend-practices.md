---
id: TASK-66
title: >-
  Fix laroux route, Image, Link and request-context defects found while writing
  frontend-practices
status: Done
assignee: []
created_date: '2026-10-04 08:57'
updated_date: '2026-10-04 20:52'
labels:
  - laroux
  - bug
dependencies: []
references:
  - pkg/@eserstack/laroux-bundler/domain/route-scanner.ts
  - pkg/@eserstack/laroux-server/domain/request-context.ts
  - pkg/@eserstack/laroux-react/runtime/navigation/link.tsx
priority: medium
ordinal: 66000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while documenting laroux for the frontend-practices skill; confirm each with a test before fixing. (1) laroux-bundler/domain/route-scanner.ts IGNORE_PATTERN only matches a path whose last segment starts with _, so a page inside an _-prefixed directory (for example _private/page.tsx) is routed and public. (2) The laroux-react Image component drops its fallback when rendered on the server. (3) laroux-react Link ignores target and download, and its prefetch option does nothing. (4) laroux-server/domain/request-context.ts keeps the request cookies in a module-level variable; nothing reads it yet, but concurrent requests would share it (frontend-practices and design-principles: Module-Level Side Effects).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A test shows a page under an _-prefixed directory is not routed, and the scanner ignores it
- [x] #2 Image renders its fallback on the server when the source fails or is missing, with a test
- [x] #3 Link honors target and download, and prefetch either works or is removed from the API and docs
- [x] #4 Request cookies are scoped per request (passed explicitly or via AsyncLocalStorage through the cross-runtime layer), or the unused module state is removed
- [x] #5 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

laroux-react: Items 2 and 3 are done and verified in code and tests. I closed one gap in item 2: an empty src with a fallback still carried srcSet and sizes, which hid the fallback in the browser. They are now dropped, and a test covers it. Items 1 (route-scanner) and 4 (request-context) belong to the laroux-bundler and laroux-server units. For AC #3, prefetch is removed from LinkProps and the laroux-react README, but laroux's LinkConfig.prefetch and the frontend-practices skill still mention it; that is listed in crossUnitNeeds.

laroux-bundler: Item 1 is done in this unit and verified. The old regex does not match _private/page.tsx. The new regex is matched by the Go walker against paths relative to the routes dir. The test covers _private, nested, admin/_internal, about/_draft, route/proxy/layout under _private, docs_v2 still routed, and a _workspace parent above the routes dir. Items 2-4 belong to the laroux-react and laroux-server units.

laroux-server: Item 4 is checked. domain/request-context.ts is deleted, and its re-export and every set/clear call in renderer.ts and server.ts are gone; grep finds no remaining references in the repo. The only module-level cache left in renderer.ts is moduleMapCache, which lives in the factory closure and is not request data. The cookie header travels per render in renderApp's requestContext prop, which is documented as not yet passed to the page. Items 1-3 belong to other units.

Orchestrator: removed LinkConfig.prefetch and buildFallbackHandler from @eserstack/laroux (README and tests updated), and rewrote the Link, Image and route sections of frontend-practices references/laroux.md. Both removals are breaking for callers of @eserstack/laroux.
<!-- SECTION:NOTES:END -->
