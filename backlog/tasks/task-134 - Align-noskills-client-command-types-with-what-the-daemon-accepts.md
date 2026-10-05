---
id: TASK-134
title: Align noskills-client command types with what the daemon accepts
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - noskills-client
  - types
dependencies: []
references:
  - pkg/@eserstack/noskills-client/types.ts
  - pkg/ajan/noskillsserverfx/permissions.go
  - pkg/ajan/noskillsserverfx/wt_attach.go
priority: low
ordinal: 134000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/ajan/noskillsserverfx/permissions.go:100-105 accepts allow, allow_always, deny and deny_remember, but PermissionResponseCommand in pkg/@eserstack/noskills-client/types.ts:315-319 types decision as "allow" | "deny" | "deny_remember", so a typed client cannot send allow_always. SetModelCommand (types.ts:329-332) is in ClientCommand, but the daemon logs set_model as unsupported (wt_attach.go:222-227).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The decision union includes allow_always
- [x] #2 SetModelCommand documents that the daemon ignores it, or is removed in a major release
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

small-b: Checked:
- PermissionDecision ('allow' | 'allow_always' | 'deny' | 'deny_remember') is exported from mod.ts and used in PermissionResponseCommand.
- The optional message field is added.
- SetModelCommand's JSDoc and the README say the daemon logs set_model and ignores it.
<!-- SECTION:NOTES:END -->
