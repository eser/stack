---
id: TASK-56
title: Add an effort option to AI generation and map it for every provider
status: Done
assignee: []
created_date: '2026-09-26 09:57'
updated_date: '2026-10-04 20:52'
labels:
  - ai
  - ajan
dependencies: []
references:
  - pkg/@eserstack/ai/generation.ts
  - pkg/ajan/aifx/adapter_anthropic.go
  - pkg/@eserstack/ajan/bridge.go
priority: medium
ordinal: 56000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GenerateTextOptions in @eserstack/ai and aifx has no effort setting; the only thinking control is thinkingBudget, which the Anthropic adapters now map to an effort level. On the Claude 5 models effort is the main cost and latency lever. From the prompt audit (report item: effort field). Add `effort?: "low" | "medium" | "high" | "xhigh" | "max"` end to end.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 GenerateTextOptions (TS and Go) and the FFI bridge request carry effort
- [x] #2 The Anthropic adapters send output_config.effort; OpenAI maps it to reasoning_effort where supported; other providers ignore it with a documented note
- [x] #3 commitmsg sends low effort
- [x] #4 Tests cover the request shape per provider
- [x] #5 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

ai-cross: Verified. Effort exists in TS GenerateTextOptions, Go GenerateTextOptions (checkEffort rejects unknown levels with ErrBadRequest and ErrUnknownEffort) and the bridge request (omitempty, sent by buildOptionsJSON). Anthropic sends output_config.effort, OpenAI sends reasoning_effort, and claude-code passes --effort in both the Go ACP shim and the TS CLI. The other providers ignore it, which is documented in the doc comments, at each adapter and in the README table. commitmsg's buildCommitMessageRequest sets effort low. Request-shape tests exist for each provider.
<!-- SECTION:NOTES:END -->
