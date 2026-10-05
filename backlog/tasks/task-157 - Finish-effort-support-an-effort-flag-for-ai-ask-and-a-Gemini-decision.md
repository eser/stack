---
id: TASK-157
title: 'Finish effort support: an --effort flag for ai ask and a Gemini decision'
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - ai
  - aifx
  - feature
dependencies: []
references:
  - pkg/@eserstack/ai/commands/ask.ts
  - pkg/ajan/aifx/adapter_google_shared.go
  - pkg/@eserstack/ai/README.md
priority: low
ordinal: 157000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-56 adds GenerateTextOptions.effort (low, medium, high, xhigh, max) and maps it for anthropic, openai and claude-code. The `ai ask` CLI (pkg/@eserstack/ai/commands/ask.ts:206) has --max-tokens but no way to set effort. gemini and vertexai ignore effort in TS and Go (pkg/ajan/aifx/adapter_google_shared.go:399-400) because their only mapped control is thinkingBudget; check which Gemini models take a thinking level and whether one can be sent instead of a budget.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ai ask accepts --effort, checked against the five levels, documented in the README Flags table, with a test
- [x] #2 Gemini and Vertex AI either map effort for the models that support it, with tests, or the reason for ignoring it is recorded
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

ai-workflows: Verified:
- parseAskArgs checks --effort against the five levels; ask.test.ts covers it and passes.
- The README Flags table and the example list --effort.
- Gemini and Vertex AI map effort to thinkingConfig.thinkingLevel in Go (applyGenAIThinkingConfig) and TS (buildGenAIRequest and mapEffortToThinkingLevel). Effort wins over the budget. An unknown level fails before sending.
- Tests: TestGenAIEffortRequest and google-shared.test.ts.
- The README Effort table and paragraph match the code.
<!-- SECTION:NOTES:END -->
