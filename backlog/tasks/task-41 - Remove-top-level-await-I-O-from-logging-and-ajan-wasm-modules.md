---
id: TASK-41
title: Remove top-level await I/O from logging and ajan wasm modules
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - logging
  - ajan
dependencies: []
references:
  - pkg/@eserstack/logging/ffi-client.ts
  - pkg/@eserstack/ajan/wasm/resolve.ts
priority: medium
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/@eserstack/logging/ffi-client.ts:27 awaits ensureLib() (dlopen) at import and pkg/@eserstack/ajan/wasm/resolve.ts:16 awaits import("node:fs") at module scope, so importing the module performs I/O. Rule: design-principles: Module-Level Side Effects.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Both load lazily on first use
- [x] #2 Importing either module performs no I/O
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

small-a: The logging half is verified by a probe. After importing logging/mod.ts, getLib() is null, and it stays null after getLogger(); the first info() loads the library. ffi-client.ts has no top-level await. logger.test.ts awaits ensureLib() at its top level, with an ignore and a reason. The ajan/wasm/resolve.ts half belongs to the ajan unit.

go-libs-bridge: wasm/resolve.ts no longer has a top-level await import of node:fs. It probes through ffi/resolve.ts fileExists, which gets statSync lazily the first time it is used, and wasm/resolve.test.ts covers it. The logging/ffi-client.ts half belongs to another unit.
<!-- SECTION:NOTES:END -->
