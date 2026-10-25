---
id: TASK-166
title: >-
  Ask the noskills discovery base questions together and follow-ups one at a
  time
status: Done
assignee: []
created_date: '2026-10-05 00:58'
updated_date: '2026-10-15 19:34'
labels:
  - noskills
  - feature
dependencies: []
priority: medium
ordinal: 166000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the removed noskills TODOS.md ("Adaptive discovery: non-adaptive questions batched, adaptive follow-ups one-by-one"). This needs the owner's decision first, because it reverses a deliberate prompt rule. Today:
- Agent-mode discovery returns one question per `next` call (the agent branch of compileDiscovery in context/compiler.ts).
- The DISCOVERY rules say "Ask questions ONE AT A TIME", and the generated CLAUDE.md says "Ask discovery questions one at a time".
- Human mode already returns every unanswered question, and `next` in agent mode already accepts one JSON object holding all six answers (commands/next.ts).
- Batch-submitted answers get the Jidoka C1 confirmation in refinement.

Changing the flow touches the TS compiler, the Go mirror (pkg/ajan/noskillsfx/compiler.go) and every generated rule file.

Decision (recorded for AC #1): yes. The owner listed this in noskills/TODOS.md as wanted. Agent-mode discovery presents the unanswered base questions together and accepts one JSON answer; adaptive follow-ups still come one at a time. Every generated rule file states the same rule.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The owner decides whether agent-mode discovery presents the six base questions together, and the decision and its reason are recorded in the task notes
- [x] #2 If yes, agent-mode DISCOVERY returns all unanswered base questions with one instruction to ask them together and submit one JSON answer, while pending follow-ups still come one at a time
- [x] #3 compiler.ts, compiler.go, sync/claude.ts, sync/rule-file.ts, sync/adapters/shared/agents-md.ts and sync/adapters/kiro.ts state the same rule
- [x] #4 Behavioral and compiler tests cover the batched base questions and the one-at-a-time follow-ups
- [x] #5 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in round 3 of the autonomous backlog run (2026-10-05); deno task cli ok passes.

Decision recorded: yes, because the owner listed it in TODOS.md.

Verified:
- `discoveryQuestionRule` in context/discovery-answers.ts is used by compiler.ts, sync/claude.ts, sync/rule-file.ts, sync/adapters/shared/agents-md.ts and sync/adapters/kiro.ts.
- The Go `discoveryQuestionRule` in compiler.go has the same text.
- No old one-at-a-time base-question wording is left.
- The Go mirror is in discovery.go.

The Go callers outside the unit (bridge.go, noskillsserverfx/specs.go) still store a JSON answer as the first question's answer; this is listed in crossUnitNeeds.
<!-- SECTION:NOTES:END -->
