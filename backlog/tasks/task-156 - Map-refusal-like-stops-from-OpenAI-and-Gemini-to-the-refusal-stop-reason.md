---
id: TASK-156
title: Map refusal-like stops from OpenAI and Gemini to the refusal stop reason
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - ai
  - aifx
  - bug
dependencies: []
references:
  - pkg/ajan/aifx/adapter_openai.go
  - pkg/ajan/aifx/adapter_google_shared.go
  - pkg/@eserstack/ai/adapters/openai.ts
  - pkg/@eserstack/ai/adapters/gemini.ts
  - pkg/@eserstack/ai/adapters/vertexai.ts
priority: medium
ordinal: 156000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-63 adds StopReason "refusal" and maps it for Anthropic, ACP and the claude-code CLI. OpenAI (finish_reason content_filter, message.refusal for structured outputs) still maps to stop (pkg/ajan/aifx/adapter_openai.go:869-870), and Gemini and Vertex AI (finishReason SAFETY, PROHIBITED_CONTENT, BLOCKLIST) report a declined or filtered answer as a normal stop, in TS and Go alike. Anthropic's model_context_window_exceeded maps to end_turn although it is a truncation like max_tokens.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The mapping per provider is decided and implemented in TS and Go
- [x] #2 Tests cover each refusal-like and truncation reason
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

ai-workflows: Verified in Go and TS:
- Go: mapOpenAIFinishReason and mapOpenAIChoiceStopReason (message.refusal also becomes a text block, and is streamed as a content delta), mapGenAIFinishReason (filter reasons map to refusal, a blocked prompt to refusal, STOP with a tool call to tool_use), mapAnthropicStopReason (model_context_window_exceeded maps to max_tokens).
- TS: the same mapping in openai.ts, google-shared.ts and anthropic.ts.
- Tests: adapter_stop_reason_test.go plus the TS openai, anthropic and google-shared tests. They pass.
- The README Refusals table matches the code.
<!-- SECTION:NOTES:END -->
