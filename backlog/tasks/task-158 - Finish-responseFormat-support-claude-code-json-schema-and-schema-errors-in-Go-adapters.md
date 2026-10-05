---
id: TASK-158
title: >-
  Finish responseFormat support: claude-code --json-schema and schema errors in
  Go adapters
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
  - pkg/ajan/aifx/adapter_acp.go
  - pkg/@eserstack/ai/adapters/claude-code.ts
  - pkg/ajan/aifx/adapter_openai.go
  - pkg/ajan/aifx/adapter_ollama.go
  - pkg/ajan/aifx/adapter_google_shared.go
priority: medium
ordinal: 158000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-57 sends responseFormat json_schema as output_config.format for Anthropic, but the claude-code provider still ignores responseFormat in the Go ACP shim args (pkg/ajan/aifx/adapter_acp.go:174) and the TS CLI adapter (pkg/@eserstack/ai/adapters/claude-code.ts buildArgs), although the claude CLI has --json-schema. mapOpenAIResponseFormat (adapter_openai.go:917), OllamaModel.buildChatBody (adapter_ollama.go:238) and applyGenAIResponseFormat (adapter_google_shared.go:373-392) discard the json.Unmarshal error on the schema, so a bad schema is silently dropped. Rule: coding-practices: Ignored Errors.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 claude-code passes the schema through --json-schema in TS and Go, with argument tests and an updated README Structured Output table
- [x] #2 The three Go adapters fail before sending with ErrInvalidResponseSchema through decodeResponseSchema, with tests
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

ai-workflows: Verified:
- Go: backendImpl(opts) adds --json-schema through claudeJSONSchema, which calls decodeResponseSchema. acpStructuredSink makes the StructuredOutput tool input the reply text.
- TS: buildArgs and jsonSchemaArg add the flag; parseJsonResult reads structured_output.
- Go: mapOpenAIResponseFormat, Ollama buildChatBody and applyGenAIResponseFormat return ErrInvalidResponseSchema wrapped in ErrBadRequest.
- Tests: TestResponseSchemaFailsBeforeSending asserts that no request was sent. TestACPJSONSchemaArgs and the claude-code.ffi test also pass.
- The README Structured Output table includes claude-code.
- I added a reason to the five new //nolint:ireturn directives in adapter_response_format_test.go.
<!-- SECTION:NOTES:END -->
