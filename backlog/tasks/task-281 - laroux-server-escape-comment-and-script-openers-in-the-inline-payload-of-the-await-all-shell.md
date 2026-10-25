---
id: TASK-281
title: >-
  laroux-server: escape comment and script openers in the inline payload of the
  await-all shell
status: Done
assignee: []
created_date: '2026-10-24 01:30'
updated_date: '2026-10-24 16:36'
labels:
  - laroux-server
  - security
milestone: m-0
dependencies: []
priority: high
ordinal: 281000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
runtime/html-shell.ts:336-338 embeds the RSC payload in `<script id="__RSC_PAYLOAD__" type="application/json">` and replaces only `</script`. A `<!--` followed by `<script` inside the payload moves the HTML tokenizer into the script-data-escaped states, so a later `</script>` no longer closes the element and attacker-influenced data can change how the rest of the page parses. TASK-12 fixed the same class on the streaming path; this is the await-all shell. Found by reading the code in the laroux design run (2026-10-23).

Reuse TASK-12's escaping for this path: escape `<` as `\u003c` (and `>` and `&` likewise) inside the JSON, which also covers `<!--` and `<script`, and check that the client parser still reads the payload. Rules: security-practices (output encoding).

Plan key: L-INT2. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A test renders a payload containing `<!--<script>` and `</script>` and the resulting HTML has exactly one closing tag for the payload script and no raw `<` inside it
- [x] #2 The client reads the escaped payload back to the same value (test)
- [x] #3 `deno task cli ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
runtime/html-shell.ts now passes the payload through adapters/react/script-json.ts escapeJsonForScript (TASK-12's escaper: < > & U+2028 U+2029). runtime/html-shell.test.ts renders chunks containing <!--<script> and </script>, checks one closing tag and no raw < or > inside the payload element, and that JSON.parse of the element text (what getEmbeddedPayload does) returns the same chunks. Full gate: deno task cli ok passed on 2026-10-24 (34 steps).
<!-- SECTION:NOTES:END -->
