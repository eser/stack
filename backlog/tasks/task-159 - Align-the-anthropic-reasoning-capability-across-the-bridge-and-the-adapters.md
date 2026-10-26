---
id: TASK-159
title: Align the anthropic reasoning capability across the bridge and the adapters
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - ai
  - aifx
  - cleanup
dependencies: []
references:
  - pkg/@eserstack/ai/adapters/ajan-bridge.ts
  - pkg/@eserstack/ai/adapters/anthropic.ts
  - pkg/ajan/aifx/adapter_anthropic.go
priority: low
ordinal: 159000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
BRIDGE_PROVIDERS in pkg/@eserstack/ai/adapters/ajan-bridge.ts (around line 861) declares "reasoning" for anthropic, but the TS AnthropicModel.capabilities (anthropic.ts:18-25) and Go AnthropicModel.GetCapabilities() (pkg/ajan/aifx/adapter_anthropic.go:80-89) do not, although both send adaptive thinking and return thinking blocks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The three capability lists agree on reasoning for anthropic
- [x] #2 A test checks the lists match
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

ai-workflows: Verified that the TS AnthropicModel.capabilities, Go AnthropicModel.GetCapabilities and BRIDGE_PROVIDERS all list reasoning. capabilities.test.ts compares the three lists per provider, reading the Go lists from the aifx source, and passes. Go TestACPCapabilitiesPerBackend pins the ACP lists. Stage 2's breaking-change list did not mention that the Go ACP lists for kiro and opencode lost tool_calling; it is added to breakingChanges.
<!-- SECTION:NOTES:END -->
