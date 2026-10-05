---
id: TASK-70
title: >-
  Route bare noskills commands in the Go compiler and persistence errors through
  the prefix
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - noskills
  - bug
dependencies: []
references:
  - pkg/ajan/noskillsfx/compile.go
  - pkg/ajan/noskillsfx/compiler.go
  - pkg/ajan/noskillsfx/schema.go
  - pkg/@eserstack/noskills/state/persistence.ts
priority: medium
ordinal: 70000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Go mirror builds agent-facing commands as bare `noskills spec <name> ...` in pkg/ajan/noskillsfx/compile.go:113, :126, :206, :251 and compiler.go:553, :574, :727, although NosManifest.Command (schema.go:508) holds the configured prefix. On the TS side, state/persistence.ts:291 throws 'Run `noskills spec list`' and :351 names `noskills spec <name> <command>`, and these reach agents through next, block and done. Both fail where the CLI is not on PATH, while the TS compiler already routes its strings through c() and cs(). TASK-62 covers the compiler.ts strings only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Compile and BuildBehavioral in pkg/ajan/noskillsfx take the command prefix and use it in every command string
- [x] #2 persistence.ts error messages use the configured prefix, passed in or applied by the caller, without importing output/cmd
- [x] #3 Go and TS tests assert a custom prefix appears in these strings
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

noskills: No bare `noskills` command strings remain in the non-test Go files; only comments mention it. BuildBehavioral takes commandPrefix, Compile uses manifest.Command, and both fall back to DefaultCommandPrefix. resolveState and requireSpecFlag require the prefix and persistence.ts does not import output/cmd. The Go and TS tests pass.
<!-- SECTION:NOTES:END -->
