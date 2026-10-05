---
id: TASK-102
title: >-
  Stop the claude-code and kiro CLI adapter streams cleanly when the consumer
  stops early
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - ai
  - bug
dependencies: []
references:
  - pkg/@eserstack/ai/adapters/claude-code.ts
  - pkg/@eserstack/ai/adapters/kiro.ts
priority: medium
ordinal: 102000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ClaudeCodeModel.#streamRawText (pkg/@eserstack/ai/adapters/claude-code.ts:136-158) and KiroModel.streamText (adapters/kiro.ts:80-120) read stdout with no try/finally. When a consumer breaks out of the stream early, the reader lock is never released and the child process is neither killed nor drained, so it can block on a full pipe. Rule: coding-practices: Release Resources Where They Are Acquired.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Reads are wrapped in try/finally that releases the lock
- [x] #2 An early return kills the child process or cancels stdout
- [x] #3 A test breaks out after the first event and shows the process ends
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

ai-workflows: Verified:
- claude-code #streamRawText and the kiro streamText read loop hold the reader in try/finally with releaseLock.
- Every CLI adapter's generateText and streamText calls cliShared.stopCliProcess from finally.
- spawnCliProcess does not kill an exited process and removes its abort listener on exit.
- cli-shared.ffi.test.ts covers four adapter configurations and passes: claude-code with text and stream-json output, kiro and opencode. Each breaks after the first event, then checks with kill -0 that the CLI's pid is gone.
<!-- SECTION:NOTES:END -->
