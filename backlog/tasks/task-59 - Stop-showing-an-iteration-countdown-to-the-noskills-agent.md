---
id: TASK-59
title: Stop showing an iteration countdown to the noskills agent
status: Done
assignee: []
created_date: '2026-09-26 09:57'
updated_date: '2026-10-04 20:52'
labels:
  - noskills
  - prompts
dependencies: []
references:
  - pkg/@eserstack/noskills/context/compiler.ts
  - pkg/ajan/noskillsfx/compiler.go
priority: medium
ordinal: 59000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
compiler.ts (urgency and restartInstruction, lines ~1023-1029 and ~3092-3101) and compiler.go:700 tell the agent 'N+ iterations — context degrading. Finish current task, recommend fresh session.' A countdown prompts early wrap-up; execution.iteration counts over the spec's lifetime and is never reset per session, so 'degrading' is often false; and it contradicts 'work through the spec's tasks to the end'. From the prompt audit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The urgency and restart prose are not sent to the agent; restartRecommended stays for the formatter and dashboard
- [x] #2 The user-facing stderr notice in invoke-hook.ts stays
- [x] #3 behavioral.test.ts, compiler.test.ts, ralph-loop.test.ts and hooks.test.ts are updated
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

noskills: Neither the agent prompt (TS or Go) nor the formatter contains urgency, restartInstruction or 'context degrading' text. restartRecommended is set in TS compileExecution and in Go Compile. The Stop hook still writes hookDecisions.restartNotice to stderr.
<!-- SECTION:NOTES:END -->
