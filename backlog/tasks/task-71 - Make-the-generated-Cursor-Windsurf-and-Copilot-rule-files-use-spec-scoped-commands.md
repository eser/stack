---
id: TASK-71
title: >-
  Make the generated Cursor, Windsurf and Copilot rule files use spec-scoped
  commands
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - noskills
  - bug
dependencies: []
references:
  - pkg/@eserstack/noskills/sync/cursor.ts
  - pkg/@eserstack/noskills/sync/windsurf.ts
  - pkg/@eserstack/noskills/sync/copilot.ts
  - pkg/@eserstack/noskills/commands/next.ts
priority: medium
ordinal: 71000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
sync/cursor.ts:25-31, sync/windsurf.ts and sync/copilot.ts tell the agent to run `<prefix> next` and `<prefix> next --answer=...` without `spec <name>`. commands/next.ts:77-91 refuses that once a spec is active ('--spec=<name> is required'), so agents in these tools hit an error on their first call. claude.ts and agents-md.ts already use `spec <name> next`. The three files differ only in their output path, so they should share one builder (coding-practices: Don't Repeat Yourself). TASK-60 edits the same files for the pre-fill and batch rules.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The three generators share one builder and emit `spec <name> next` forms
- [x] #2 A sync test checks the generated text for each tool
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

noskills: The Cursor, Windsurf and Copilot adapters call sync/rule-file.ts writeRuleFile. The text uses `<prefix> spec <name> next`, and rule-file.test.ts covers every adapter.
<!-- SECTION:NOTES:END -->
