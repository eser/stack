---
id: TASK-169
title: 'Reload API routes, proxies and page modules after a laroux dev rebuild'
status: To Do
assignee: []
created_date: '2026-10-05 00:58'
labels:
  - laroux
  - dev
dependencies: []
priority: medium
ordinal: 169000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After a successful dev rebuild, laroux-server now reloads its route list and sends the HMR update (TASK-96). Three things still stay stale until restart:
- ApiRouteHandler.loadRoutes and MiddlewareDispatcher.loadProxies run only at startup, and they import their registries by a URL without a cache-busting query, so calling them again returns the cached module.
- The generated routes file imports page modules statically, so re-importing it with ?t= does not reload the pages.
- The cssOnly watch path rewrites styles.css from global.css without appending the CSS module styles, so a CSS-only change drops them from styles.css until the next full build.

Fixing this needs a decision on how dev mode cache-busts the server module graph (Deno caches imports by URL), which is a design change beyond this run.

Decision: in dev mode, the server imports the route registry, the proxy registry and page modules with a build-id query (?v=<buildId>) so each rebuild loads fresh modules, and the generated routes file adds the same query to its page imports. The cssOnly path appends the CSS module styles as the full build does.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 After a dev rebuild, a changed route.ts, proxy.ts or page module is served without a restart, shown by a test
- [ ] #2 A CSS-only rebuild keeps CSS module styles in styles.css
- [ ] #3 deno task cli ok passes
<!-- AC:END -->
