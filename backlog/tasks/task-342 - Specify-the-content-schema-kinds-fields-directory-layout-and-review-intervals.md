---
id: TASK-342
title: >-
  Specify the content schema: kinds, fields, directory layout and review
  intervals
status: In Progress
assignee: []
created_date: '2026-10-25 09:50'
updated_date: '2026-10-25 13:49'
labels:
  - persona
  - track-p
  - docs
milestone: m-9
dependencies: []
priority: high
ordinal: 345000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Turn decision-65 into a schema specification as a backlog doc. Settled already: the year-folder layout, the shared required fields (kind, title, summary, lang, status, visibility, updated), the review intervals, the slug and shortcut model. Still to write: the extra fields of each kind (bio, experience, project, approach, article, video, social, channel, profile), the exact slug and shortcut grammar, the status values (including a project lifecycle with archived), the reserved command names, the sensitive-data patterns the validator rejects, and the translation naming. Use the example record in doc-4. Documents only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A backlog doc lists every kind with required and optional fields and one example record each
- [x] #2 The slug grammar, the shortcut rules and the reserved-name list are written down
- [ ] #3 Review intervals are set per kind, and the owner has read the doc
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The schema specification is doc-6 (backlog/docs/doc-6 - Content-schema-kinds-fields-identity-and-validation-rules.md): fields and one example record per kind, the slug, file name and shortcut grammar, the reserved names, the status values with archived and an optional project stage, review intervals, translation naming and the sensitive-data patterns. It ends with 19 open questions for the owner, each with a recommended answer.

AC #3 waits on the owner reading doc-6 and answering its open questions.
<!-- SECTION:NOTES:END -->
