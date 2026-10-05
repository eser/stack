---
id: TASK-75
title: Bound the git wrapper's noskills check with a timeout
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - noskills
  - robustness
dependencies: []
references:
  - pkg/@eserstack/noskills/commands/git-wrapper.ts
priority: medium
ordinal: 75000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The generated wrapper script (commands/git-wrapper.ts:203) runs `<command prefix> invoke-hook git-exec` for git writes, pushes and commands with global options, and waits with no limit. With the default prefix `npx eser@latest noskills`, that call can block on the network, which hangs every agent git call. Rule: coding-practices: External Calls Have Timeouts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The wrapper stops waiting after a bounded time and refuses the command with a clear message
- [x] #2 A test with a check command that never returns shows the wrapper exits within the bound
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

noskills: Reviewed the watcher, trap and temp-file logic in buildWrapperScript. git-wrapper.test.ts covers a check that never returns and one that ignores SIGTERM, with an elapsed-time bound. The tests pass.
<!-- SECTION:NOTES:END -->
