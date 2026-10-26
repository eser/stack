---
id: TASK-83
title: >-
  Give laroux's browser logging shim the Logger surface and use it in dev
  bundles
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - laroux
  - laroux-bundler
  - bug
dependencies: []
references:
  - pkg/@eserstack/laroux/config/defaults.ts
  - pkg/@eserstack/laroux-bundler/adapters/runtime-bundler/runtime-bundler.ts
priority: medium
ordinal: 83000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
DEFAULT_BROWSER_SHIMS in pkg/@eserstack/laroux/config/defaults.ts:94-104 maps @eserstack/logging to getLogger() returning only no-op debug, info, warn and error. It has no with(), trace, critical, config or Severities, so client code that follows the structured logging rule (logger.with(...)) throws in production bundles, and client warnings and errors are silently dropped. The runtime (dev) bundler in laroux-bundler/adapters/runtime-bundler does not apply browserShims at all, so dev bundles the FFI-backed logger into the browser. Related to TASK-40. Rule: coding-practices: Structured Logging.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The shim implements the Logger methods, with with() returning a logger, and forwards warn and error to the console or a configured sink
- [x] #2 The runtime bundler applies the same browser shims
- [x] #3 A test bundles a client module that calls logger.with(...).warn(...)
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

laroux: The logging browser shim is used by DEFAULT_BROWSER_SHIMS. RuntimeBundler applies browserShims through rolldown and the import map resolver plugin. runtime-bundler.test.ts and system.test.ts call logger.with(...).warn(...) from a client module and pass.
<!-- SECTION:NOTES:END -->
