---
id: TASK-169
title: 'Reload API routes, proxies and page modules after a laroux dev rebuild'
status: Done
assignee: []
created_date: '2026-10-05 00:58'
updated_date: '2026-10-15 19:34'
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
- [x] #1 After a dev rebuild, a changed route.ts, proxy.ts or page module is served without a restart, shown by a test
- [x] #2 A CSS-only rebuild keeps CSS module styles in styles.css
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in round 3 of the autonomous backlog run (2026-10-05); deno task cli ok passes.

Verified. ServerModules.load(buildId) imports the page routes, the layout, the API route and proxy registries and the server actions by URLs that end in `?v=<buildId>` (build-module.ts). generateRouteFile adds the same query to page and layout imports through `moduleVersion`. The rebuild handler loads the new modules before it sends the HMR update. watch() waits for the callback's promise. The CSS-only path writes styles.css as a full build does (global stylesheet, then the CSS module styles) and regenerates the derived CSS.

Tests cover each part:
- An integration test in server-modules.test.ts runs a real dev build, changes page.tsx, route.ts and proxy.ts, rebuilds, and checks the new responses.
- Unit tests cover the route and middleware dispatchers, the rebuild handler and build-module.
- system.test.ts checks that a CSS-only rebuild writes the same styles.css as a full build, CSS module styles included.

All of them pass.

Two fixes in server-modules.ts:
- I added a reason comment to the no-await-in-loop ignore in the catch block of loadServerActions.
- The load() doc now says what happens when an API route or proxy registry fails to load after the pages loaded.

I added the startup-failure strictness to breakingChanges. Known limitation, documented in the laroux-server README: a module that route.ts or proxy.ts imports keeps its first version until the dev server restarts. Stage 2 proposed a follow-up task for it.
<!-- SECTION:NOTES:END -->
