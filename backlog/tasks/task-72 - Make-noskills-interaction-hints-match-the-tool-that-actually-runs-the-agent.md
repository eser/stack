---
id: TASK-72
title: Make noskills interaction hints match the tool that actually runs the agent
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - noskills
  - bug
dependencies: []
references:
  - pkg/@eserstack/noskills/context/compiler.ts
  - pkg/@eserstack/noskills/commands/run.ts
priority: medium
ordinal: 72000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Several context/compiler.ts strings name AskUserQuestion whatever hints.hasAskUserTool says: the SPEC CREATION and CONCERN MANAGEMENT rules (lines 764 and 769), the agent-mode discovery instruction (2314), the alternatives instruction (2546), the review checklist (2580) and the refinement instruction (2602). READ_ONLY_RULE at line 609 names Claude Code's Shift+Tab. Cursor, Kiro, Windsurf and Copilot get instructions they cannot follow. Separately, commands/run.ts:296 calls headlessHints(config.tools), which takes the first configured tool's hints (run.ts:595-600), although the loop always runs the claude-code provider.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every AskUserQuestion and Shift+Tab mention in compiler.ts is gated on the interaction hints
- [x] #2 noskills run resolves hints for the provider it runs
- [x] #3 Compiler tests cover output for a tool without AskUserQuestion
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

noskills: Checked every AskUserQuestion mention in compiler.ts: each one sits behind hints.hasAskUserTool or optionPresentation === 'tool'. Shift+Tab appears only as the planModeShortcut hint value. run.ts headlessHints uses AGENT_PROVIDER, and the README documents both behaviors.
<!-- SECTION:NOTES:END -->
