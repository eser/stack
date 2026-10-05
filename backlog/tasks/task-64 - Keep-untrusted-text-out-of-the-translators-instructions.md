---
id: TASK-64
title: Keep untrusted text out of the translator's instructions
status: Done
assignee: []
created_date: '2026-09-26 09:57'
updated_date: '2026-10-04 20:52'
labels:
  - posts
  - security
dependencies: []
references:
  - pkg/@eserstack/posts/adapters/anthropic/translator.ts
priority: low
ordinal: 64000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/@eserstack/posts/adapters/anthropic/translator.ts interpolates the text to translate directly into the instruction. Rule: security-practices LLM Trust Boundary. commitmsg already wraps its diff in tags.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The text goes in a delimited <text> section with an instruction to treat it as data
- [x] #2 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

posts: translation-prompt.ts puts the text and both language codes in tagged sections (<text>, <source_language>, <target_language>), and closing tags inside the input are escaped case-insensitively. The fixed instructions are in the system field and say to treat the sections as data, not instructions. readTranslation rejects a reply cut off at max_tokens or an empty one. translator.ts passes system and maxTokens 16000. I confirmed that the Anthropic adapter forwards options.system and maps stop_reason to max_tokens. The tests pass.
<!-- SECTION:NOTES:END -->
