---
id: TASK-348
title: Introduce content/ with the first seed records and the language exemption
status: To Do
assignee: []
created_date: '2026-10-25 09:50'
labels:
  - persona
  - track-p
  - code
  - docs
milestone: m-9
dependencies:
  - TASK-345
  - TASK-343
priority: high
ordinal: 351000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create content/ with the first records (a bio, one project, one profile, one approach) and record the exemption from the English-only rule for content/ in AGENTS.md and the skills (decision-66). Add the content-layer rules to the skills: a content-practices reference or skill, and the sensitive-data rule in security-practices. Language and file-name validators skip content/ as the schema defines.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 content/ passes the validators with the Turkish and English records the owner gave
- [ ] #2 AGENTS.md and the affected skills state the exemption and the rules
- [ ] #3 validate-filenames and the English check treat content/ as the schema says
- [ ] #4 The owner has approved the workflow and skill changes
<!-- AC:END -->
