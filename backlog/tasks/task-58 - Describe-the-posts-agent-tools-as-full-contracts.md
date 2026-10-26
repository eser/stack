---
id: TASK-58
title: Describe the posts agent tools as full contracts
status: Done
assignee: []
created_date: '2026-09-26 09:57'
updated_date: '2026-10-04 20:52'
labels:
  - posts
  - ai
dependencies: []
references:
  - pkg/@eserstack/posts/adapters/ai/tool-definitions.ts
priority: medium
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The 13 tools in pkg/@eserstack/posts/adapters/ai/tool-definitions.ts have one-line descriptions. Several publish publicly and cannot be undone, and none says so, names its sibling tools or states what it returns. Tool descriptions are the main factor in tool-use quality. From the prompt audit (Group 3, under-described).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each description has 3-4 sentences: what it does, whether it publishes publicly or is read-only, when to use a sibling tool instead, what it returns and how errors come back
- [x] #2 Limits in the descriptions match application/handlers.ts
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

posts: Each of the 13 descriptions in adapters/ai/tool-definitions.ts has 3-4 sentences. Each says public or read-only, names an existing sibling tool, says what it returns and how an error comes back. I checked every behavior claim against handlers.ts, PostService and the Twitter/X and Bluesky adapters. The character limits are computed from the domain's getCharacterLimit, and tests in tool-definitions.test.ts check all of this. The fan-out descriptions hold for the auths-wired path, which the CLI and TUI wiring always use. Stage 2 already filed the gap in the no-auths fallback as a new task.
<!-- SECTION:NOTES:END -->
