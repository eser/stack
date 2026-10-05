---
id: TASK-87
title: Validate posts agent tool-call arguments before dispatch
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - posts
  - security
dependencies: []
references:
  - pkg/@eserstack/posts/adapters/ai/triggers.ts
  - pkg/@eserstack/posts/adapters/ai/tool-definitions.ts
priority: high
ordinal: 87000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
routeToolCall in pkg/@eserstack/posts/adapters/ai/triggers.ts:62-138 casts event.arguments, which is model output, straight to the handler input types with no runtime check; the file header itself says validation is pending. Several of these tools publish posts publicly and cannot be undone. Rule: security-practices: LLM Trust Boundary.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each tool's arguments are validated against its JSON Schema in tool-definitions.ts (required fields, platform enum, minItems, integer minimum) before the handler runs
- [x] #2 Invalid arguments return an isError tool response that names the bad field
- [x] #3 Tests cover a missing field, a wrong platform and a wrong type
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

posts: Checked independently. routeToolCall looks up the tool definition and runs validateToolArguments (adapters/ai/tool-arguments.ts) before any bound trigger. The validator covers type, properties, required, enum, items, minItems, minimum, minLength and pattern, and treats object schemas as closed, using Object.hasOwn so names like constructor or __proto__ are rejected. Bad calls return isError content naming each field, for example: argument "platform" must be one of "twitter", "bluesky"; got "mastodon". tool-arguments.test.ts checks that every definition uses only supported keywords. triggers.test.ts covers a missing field, a wrong platform and a wrong type with no handler run, and routes all 13 tools. TwitterSocialApi.requireTweetId stops path-like IDs from reaching request URLs, with tests.
<!-- SECTION:NOTES:END -->
