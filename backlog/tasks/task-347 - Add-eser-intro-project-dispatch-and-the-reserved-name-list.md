---
id: TASK-347
title: 'Add eser intro, project dispatch and the reserved-name list'
status: To Do
assignee: []
created_date: '2026-10-25 09:50'
labels:
  - persona
  - track-p
  - code
milestone: m-9
dependencies:
  - TASK-344
  - TASK-346
priority: high
ordinal: 350000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement decision-67 in the Go eser binary of m-3: eser intro with depth (eser intro experience), --for <profile>, --lang, --format md|json (machine format without a TTY, with schemaVersion), and eser <name> that forwards to the project's cli when the record has one and prints the card otherwise. Existing developer commands keep their names.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 eser intro lists the categories and the exact command for each
- [ ] #2 eser laroux ... still forwards to the laroux binary
- [ ] #3 A project without cli prints its card
- [ ] #4 A shortcut that equals a command name is rejected by the validator from TASK-345
- [ ] #5 The gate passes
<!-- AC:END -->
