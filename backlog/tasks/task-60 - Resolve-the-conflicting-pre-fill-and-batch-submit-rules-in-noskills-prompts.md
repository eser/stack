---
id: TASK-60
title: Resolve the conflicting pre-fill and batch-submit rules in noskills prompts
status: Done
assignee: []
created_date: '2026-09-26 09:57'
updated_date: '2026-10-04 20:52'
labels:
  - noskills
  - prompts
dependencies: []
references:
  - pkg/@eserstack/noskills/sync/adapters/shared/agents-md.ts
  - pkg/@eserstack/noskills/context/compiler.ts
priority: medium
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The generated agent files (sync/cursor.ts, windsurf.ts, copilot.ts, adapters/shared/agents-md.ts, adapters/kiro.ts) say 'Do NOT pre-fill answers. Do NOT batch multiple answers', while compiler.ts tells the agent to pre-fill suggested answers marked STATED/INFERRED and to submit all confirmed answers in one `noskills next --answer` call; compiler.ts:701 also says 'never batch-submit'. A model given both follows whichever it read last. From the prompt audit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All generators and compiler.ts state one rule: pre-filled suggestions are marked STATED or INFERRED and confirmed by the user; confirmed answers go in the single call transition.onComplete shows; the agent never submits unconfirmed answers
- [x] #2 behavioral.test.ts still finds 'noskills next --answer'
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

noskills: Every place that states the rule uses discoveryAnswerRule: compiler.ts DISCOVERY, claude.ts, cursor.ts, windsurf.ts, copilot.ts, agents-md.ts and kiro.ts. Go has a mirror. A grep finds no contradicting 'do not pre-fill' or 'never batch-submit' wording.
<!-- SECTION:NOTES:END -->
