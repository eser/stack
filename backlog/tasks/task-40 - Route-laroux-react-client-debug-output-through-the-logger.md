---
id: TASK-40
title: Route laroux-react client debug output through the logger
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - laroux
  - logging
dependencies: []
references:
  - pkg/@eserstack/laroux-react/client.ts
priority: medium
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/@eserstack/laroux-react/client.ts (79 console calls) and client/bootstrap/lazy-loader.ts (36) print debug output in the browser hydration path, most not behind a debug flag. About 160 more console calls exist across 85 files, mostly CLI output. Depends on the lint-config task deciding no-console. Rule: coding-practices: Structured Logging.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 laroux-react client code logs through @eserstack/logging behind a level, or the debug scaffolding is removed
- [x] #2 CLI output that is intentional uses the shell output helpers or a documented no-console exception
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

laroux-react: Verified: no console.* calls and no DEBUG scaffolding remain in pkg/@eserstack/laroux-react. Warnings and errors go through @eserstack/logging under the laroux-bundler category, using only debug/info/warn/error, which the browser shim supports. error-boundary.tsx logs once, in componentDidCatch. The broken dev logging configure call in entry.tsx is removed. Production bundles use the no-op shim, so client warnings and errors are dropped unless the app maps browserShims; before, error-boundary logged with console.error in every build. The README Architecture section documents this. Making the shim forward warn and error is the laroux unit's shim task.
<!-- SECTION:NOTES:END -->
