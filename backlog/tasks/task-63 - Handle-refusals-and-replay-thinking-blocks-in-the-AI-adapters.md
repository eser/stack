---
id: TASK-63
title: Handle refusals and replay thinking blocks in the AI adapters
status: Done
assignee: []
created_date: '2026-09-26 09:57'
updated_date: '2026-10-04 20:52'
labels:
  - ai
  - ajan
dependencies: []
references:
  - pkg/@eserstack/ai/adapters/anthropic.ts
  - pkg/ajan/aifx/adapter_anthropic.go
priority: medium
ordinal: 63000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Both Anthropic adapters map stop_reason 'refusal' to end_turn, so a declined request looks like a normal answer; commitmsg and the translator would use the refusal text. The Go adapter also drops thinking blocks to text instead of carrying them (with signatures) back into the next request, which the posts agent loop needs. From the prompt audit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 StopReason has a refusal value in TS and Go, mapped from the API
- [x] #2 commitmsg and the translator fail on a refusal
- [x] #3 Thinking blocks are kept as their own kind and replayed unchanged in multi-turn calls
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

ai-cross: Verified. Refusal is mapped in the TS Anthropic and Go Anthropic adapters, the Go ACP adapter, the TS claude-code adapter and the TS bridge mapStopReason, and Go carries it over the wire unchanged. commitmsg.readCommitMessage and posts translation-prompt.readTranslation (which translator.ts calls) fail on refusal, and both have tests. Thinking blocks are their own kind in TS and Go, in generate, stream and bridge, and are replayed unchanged. Unsigned blocks are dropped. Fixed a TS/Go mismatch: TS now also drops a thinking block whose signature is empty (and ignores empty redactedData) instead of sending it to the API, which would reject it. Added a test case for this.

Orchestrator: the posts agent loop (adapters/ai/agent.ts) also fails on a refusal now, with a test, and the acpfx StopReason comment is corrected.
<!-- SECTION:NOTES:END -->
