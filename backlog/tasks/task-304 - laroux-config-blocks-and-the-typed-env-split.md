---
id: TASK-304
title: 'laroux: /config blocks and the typed env split'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux
  - track-l
milestone: m-7
dependencies:
  - TASK-293
priority: medium
ordinal: 304000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 sections 7.9 and 14 (decision-54). defineConfig gains the `ids`, `actions`, `limits`, `islands`, `sessions`, `i18n`, `env`, `csp`, `bots`, `client` and `base` blocks, typed and validated, with defaults that match doc-3. The env split: `envField` and the schema; `/env/client` for client-context values inlined at build; `/env/server` (react-server only) reading server values at run time from the HostContext env; startup validation; the allow-list laroux-server passes to the bundler's env plugin; the build error for non-public `process.env.X` or `import.meta.env.X` in a client graph; and the post-build scan that fails when a server value longer than 8 characters appears in a client chunk.

New subpaths ship beside the existing laroux exports (additive in 5.x). Rules: javascript-practices, frontend-practices, security-practices where the section touches input, keys or output.

Plan key: L4l. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Type tests show an invalid config block fails to type-check, and runtime validation rejects it with a message naming the field
- [ ] #2 A fixture shows a server secret is never present in any client chunk, and the scan fails a build that inlines one on purpose
- [ ] #3 A test shows a missing required server variable fails at startup with its name
- [ ] #4 The laroux README documents the new API with examples, and the gate passes
<!-- AC:END -->
