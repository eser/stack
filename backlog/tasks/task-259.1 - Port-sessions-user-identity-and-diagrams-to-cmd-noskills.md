---
id: TASK-259.1
title: 'Port sessions, user identity and diagrams to cmd/noskills'
status: Done
assignee: []
created_date: '2026-10-24 20:51'
updated_date: '2026-10-25 02:13'
labels: []
milestone: m-4
dependencies:
  - TASK-257
parent_task_id: TASK-259
priority: medium
ordinal: 320000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the TASK-256 gap table: behaviors that no M4 task named, closest to the state commands. Port to Go, matching the TypeScript twin: the session command (start with --spec, --free or --auto, list, end, gc, free) with the full Session record (pid and startedAt kept on rewrite, no auto mode written, spec written as null), the user identity (~/.config/noskills/user.json, the git user fallback, resolveUser feeding answer, transition and creator attribution) and the config command (set-user, get-user, clear-user, --from-git), and diagrams (.eser/diagrams.json; scan, list, check, verify; staleness feeding COMPLETED).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each listed command runs from cmd/noskills and matches the TypeScript output on a golden scenario
- [x] #2 make ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25 (done by a delegated agent).
In Go, with no forwarding:
- session: start --spec=|--free|--auto, list, end [--id=], gc. The Session record matches TS field for field: spec and phase null in free mode, pid 0, mode only free or spec. A phase rewrite keeps pid and startedAt. Staleness and list labels follow JS Date rules.
- config: set-user --name/--email or --from-git, get-user, clear-user.
- diagrams: scan, list, check, verify <file> [--line=N]. COMPLETED's staleDiagrams uses the shared CheckDiagramStaleness.
- User identity is one resolver: LifecycleEnv.ResolveUser delegates to ResolveUserWith (new identity.go), which the config command uses too; noskills-server and the bridge reach it through ServiceLifecycleEnv.
noskillsfx/session.go was rewritten (its only callers were tests).
AC #1: new goldens sessions (26 steps), user_identity (28) and diagrams (19) pass. Session ids are replaced by <SESSION_n>, and each run gets a temp HOME, so nothing touches the real ~/.config.
Go differs on purpose:
- user.json is written 0600 in a 0700 directory;
- config messages use the manifest's prefix;
- failures print 'noskills: <msg>' and exit 1;
- the git lookup has a 10 s timeout;
- the diagram scan goes through os.Root.
TS bugs are filed as a follow-up. The agent's make ok failed only on the code-conventions baseline, from my new run-loop.test.ts (a named getPlatform import). Fixed by using a namespace import; the baseline is unchanged and validate-code-conventions passes. Closing waits on the full gate.

2026-10-25: rtk make ok and deno task cli ok passed with all agent work in place.
<!-- SECTION:NOTES:END -->
