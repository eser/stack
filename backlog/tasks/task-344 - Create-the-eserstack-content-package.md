---
id: TASK-344
title: Create the @eserstack/content package
status: To Do
assignee: []
created_date: '2026-10-25 09:50'
updated_date: '2026-10-25 09:56'
labels:
  - persona
  - track-p
  - code
milestone: m-9
dependencies:
  - TASK-341
  - TASK-342
priority: high
ordinal: 347000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add the typed @eserstack/content package to pkg/@eserstack/ from the library-pkg recipe (decision-65). It reads content/, parses Markdown with YAML frontmatter, validates a record against the schema from TASK-342 and returns typed values. It also owns the shortcut index (TASK-346) and the snapshot builder (TASK-349). It has no I/O beyond reading files and no personal data.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The package follows architecture-guidelines and its README follows documentation-conventions
- [ ] #2 Tests cover every kind, a missing field and a bad value
- [ ] #3 The gate passes
<!-- AC:END -->
