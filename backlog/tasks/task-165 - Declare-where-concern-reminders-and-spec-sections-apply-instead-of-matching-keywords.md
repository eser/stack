---
id: TASK-165
title: >-
  Declare where concern reminders and spec sections apply instead of matching
  keywords
status: To Do
assignee: []
created_date: '2026-10-05 00:58'
labels:
  - noskills
  - feature
dependencies: []
priority: medium
ordinal: 165000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the removed noskills TODOS.md ("Concern sections: make fully context-aware beyond classification flags, consider semantic relevance per concern per spec type"). Concern content reaches a spec in two ways:
- specSections and reviewDimensions filter on SpecClassification flags (involvesWebUI, involvesPublicAPI, involvesDataHandling).
- Reminders are filtered by substring heuristics on their own text in context/concerns.ts (getReminders, isFileSpecificReminder, getTier2RemindersForFile, which match words such as "slop", "ui element", "api doc" and "migration"), mirrored in pkg/ajan/noskillsfx/concerns.go.

So a custom concern whose reminder happens to contain "migration" becomes file-specific, and a UI reminder that avoids the keywords reaches every spec and file. Too large for the TODOS cleanup: it changes the ConcernDefinition schema (also the pack registry format), the 17 default concerns, the TS and Go filters and the living-spec sections. It also needs the owner to pick the vocabulary for where content applies: classification flags, file kinds or spec types.

Decision: the vocabulary is the classification the compiler already has: `scope: ["ui", "api", "data", "migration"]`, where ui, api and data map to involvesWebUI, involvesPublicAPI and involvesDataHandling, and migration marks file-specific content. Content without a scope applies everywhere. The pack registry format accepts the field.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A concern's reminders and spec sections can each declare where they apply (for example a `scope` of ui, api, data or migration); without a declared scope they apply everywhere
- [ ] #2 context/concerns.ts and pkg/ajan/noskillsfx/concerns.go filter by the declared scope, and no substring match on reminder text remains
- [ ] #3 The 17 default concerns declare scopes, and the existing compiler and behavioral tests keep their output
- [ ] #4 README-HOW's concern authoring section documents the field
- [ ] #5 Tests cover a custom concern with and without scopes for UI, API and other specs and files, in TS and Go
- [ ] #6 deno task cli ok passes
<!-- AC:END -->
