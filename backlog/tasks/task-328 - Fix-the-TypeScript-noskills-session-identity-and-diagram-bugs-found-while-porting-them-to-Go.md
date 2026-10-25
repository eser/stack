---
id: TASK-328
title: >-
  Fix the TypeScript noskills session, identity and diagram bugs found while
  porting them to Go
status: Done
assignee: []
created_date: '2026-10-25 02:06'
updated_date: '2026-10-25 02:37'
labels:
  - noskills
  - bug
dependencies: []
priority: medium
ordinal: 331000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in TASK-259.1; Go already behaves. (1) dashboard/diagrams.ts:302 'break' leaves only the inner loop, so a diagram is reported once per referenced file. (2) dashboard/diagrams.ts:151 ASCII detection does not skip lines it took, so one box drawing gives an entry per line. (3) dashboard/diagrams.ts:70 the '!includes(".")' filter can never fail, and 'src/login.ts' also yields 'src/login'. (4) dashboard/diagrams.ts:244 scan throws ENOENT when .eser/ is missing. (5) state/persistence.ts:1051 and :1062, commands/session.ts:260: an unreadable lastActiveAt is never stale (gc never removes it, list prints 'NaNh ago'); a null one reads as the epoch. (6) commands/session.ts:87: '--spec=' with an empty value writes spec '' with phase IDLE; '--spec=x --free' writes mode free with a spec. (7) commands/session.ts:146 pid is always 0 (the comment says Deno cannot expose it). (8) commands/session.ts:222/:226 'end' exits 0 when the session is not found. (9) state/identity.ts:26 with neither HOME nor USERPROFILE the path is a literal '~' relative to the cwd. (10) state/identity.ts:4/:21/:37/:55 and commands/config.ts:6 document ~/.config/noskills but the path is ~/.config/eser/noskills. (11) commands/config.ts never calls loadCommandPrefix. (12) state/identity.ts:72 clearCurrentUser reports any failure as 'No user configured.'; user.json is written with the default mode (identity.ts:61).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each item has a failing test and is fixed in TS, or documented as intended
- [x] #2 The sessions, user_identity and diagrams goldens are re-recorded where TS output changes and pass against Go
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision on item 7 (pid): session start keeps writing pid 0, in TypeScript and Go, and 0 now means no owning process. The process that runs session start exits as soon as it prints the export lines, so runtime.process.pid (or os.Getpid) would record a dead process, and a later liveness check would read every session as abandoned. The agent that works in the session is not known to the command, and cross-runtime exposes no parent pid. The reason is in commands/session.ts, cmd/noskills/session.go, the Session.pid docs of persistence.ts and noskillsfx/session.go, and cmd/noskills/README.md.

2026-10-25: rtk make ok and deno task cli ok passed. (Fixed by a delegated agent.) Eleven items are fixed in TS and Go; the Go port had copied the TS bugs for parity. Item 7, pid 0, is kept and documented: the session start process exits right after printing, so its pid would name a dead process. Tests: commands/session-config-diagrams.test.ts plus unit tests in dashboard/diagrams.test.ts, commands/session.test.ts and state/identity.test.ts. The sessions and diagrams goldens were re-recorded; user_identity did not change; all replay against Go.
<!-- SECTION:NOTES:END -->
