---
id: TASK-62
title: Fix noskills run prompts that assume an interactive user or a bare CLI
status: Done
assignee: []
created_date: '2026-09-26 09:57'
updated_date: '2026-10-04 20:52'
labels:
  - noskills
dependencies: []
references:
  - pkg/@eserstack/noskills/commands/run.ts
  - pkg/@eserstack/noskills/context/compiler.ts
  - pkg/@eserstack/noskills/commands/invoke-hook.ts
priority: low
ordinal: 62000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The non-interactive `noskills run` loop (commands/run.ts:478-484) forwards interactive rules such as 'Use AskUserQuestion for all decision points'. Several compiler strings (compiler.ts:721-728, 1659-1660, 2898) use a bare `noskills ...` command while the rest uses the configured prefix via c()/cs(), so they fail where the CLI is not on PATH. The invoke-hook.ts:405 reminder goes to stderr on exit 0 and likely never reaches the model. From the prompt audit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The run loop compiles without interactive-only rules
- [x] #2 All command strings go through c()/cs()
- [x] #3 The invoke-hook reminder moves to additionalContext or is removed
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

noskills: headlessHints sets interactive:false, and the compiler then drops the rules that wait for a person. compiler.ts has no bare commands left. The PreToolUse reminder now goes through additionalContext, shown once per iteration (the Stop hook clears the flag). I also routed the one bare command left in next.ts (the CEO review hint) through cmd.cmd.
<!-- SECTION:NOTES:END -->
