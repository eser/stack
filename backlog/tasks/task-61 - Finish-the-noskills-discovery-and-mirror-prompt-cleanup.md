---
id: TASK-61
title: Finish the noskills discovery and mirror prompt cleanup
status: Done
assignee: []
created_date: '2026-09-26 09:57'
updated_date: '2026-10-04 20:52'
labels:
  - noskills
  - prompts
dependencies: []
references:
  - pkg/ajan/noskillsfx/compiler.go
  - pkg/@eserstack/noskills/sync/adapters/
priority: low
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Items from the prompt audit the applied diff left out: (1) the Go mirror compiler.go:551-555 still has the 'You MUST be in plan mode' / DO NOT / MAY run the TS side replaced with one read-only rule; (2) compiler.ts:855 and :896 repeat 'DO NOT create, edit, or write any files'; (3) the executor and verifier prompts in sync/adapters/{claude-code,codex,opencode,copilot-cli,kiro}.ts hardcode `deno check`/`deno test`, which is wrong in non-Deno projects; (4) defaults/concerns/009-root-cause.json and 007-well-engineered.json use 'IRON LAW' caps; (5) compiler.ts:1041 'Do not elaborate' suppresses updates.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 compiler.go matches the TS discovery rule
- [x] #2 The duplicate write bans are gone or reduced to the single rule
- [x] #3 Executor and verifier prompts name the project's type check and tests instead of Deno commands
- [x] #4 The two concern rules read at normal volume and keep their reasons
- [x] #5 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

noskills: READ_ONLY_RULE appears once per read-only phase in TS and Go, and modeOverride is 'plan mode'. agent-prompts.ts replaces deno check/test in all five adapters. The 007 and 009 concerns read at normal volume and keep their reasons. BLOCKED now gives the submit command. In Go the rule text matches TS, but the command is still bare `noskills spec <name>`; stage 2 reported that as a new task.
<!-- SECTION:NOTES:END -->
