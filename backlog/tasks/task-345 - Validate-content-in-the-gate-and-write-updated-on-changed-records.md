---
id: TASK-345
title: Validate content in the gate and write updated on changed records
status: To Do
assignee: []
created_date: '2026-10-25 09:50'
updated_date: '2026-10-25 10:02'
labels:
  - persona
  - track-p
  - code
milestone: m-9
dependencies:
  - TASK-344
priority: high
ordinal: 348000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add content validators to the precommit workflow in .eser/manifest.yml: schema, the year folder matching the slug year, broken refs, shortcut uniqueness among published records, reserved command names, visibility values, sensitive patterns (telephone number, street address, personal email), and a required lang. Add a fixing step that sets updated on content files whose frontmatter or body changed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A fixture per rule fails the gate for the right reason
- [ ] #2 private visibility and a telephone number are rejected
- [ ] #3 Editing a body sets updated; a no-op run changes nothing
- [ ] #4 The gate passes
<!-- AC:END -->
