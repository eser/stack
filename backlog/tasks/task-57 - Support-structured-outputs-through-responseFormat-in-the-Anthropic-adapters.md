---
id: TASK-57
title: Support structured outputs through responseFormat in the Anthropic adapters
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
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Both Anthropic adapters ignore GenerateTextOptions.responseFormat, so JSON output depends on prompt wording. Claude supports output_config.format with a JSON schema. From the prompt audit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When responseFormat.type is json_schema, both adapters send output_config.format with the schema, merged with effort
- [x] #2 A test checks the request shape in TS and Go
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

ai-cross: Verified. Both Anthropic adapters send json_schema as output_config.format in the same output_config object as effort. Go sets fields on params.OutputConfig and newAnthropicBatchRequest copies OutputConfig. A missing or invalid schema fails before sending (TS BadRequestError, Go ErrBadRequest plus ErrInvalidResponseSchema). json_object and text are ignored, as documented. The structured_output capability was added. Tests cover generate, stream and batch.
<!-- SECTION:NOTES:END -->
