---
id: TASK-343
title: Inventory the scattered repositories and sources and propose a seed order
status: Done
assignee: []
created_date: '2026-10-25 09:50'
updated_date: '2026-10-25 13:46'
labels:
  - persona
  - track-p
  - docs
milestone: m-9
dependencies: []
priority: medium
ordinal: 346000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
List what is under ~/projects/eser and on the owner's platforms that belongs in the content layer: eser.ozvataf.com, eser.live*, intro, wiki, notes, twitter-archive, posts and the pet projects. For each, say which kind it becomes, whether the code stays outside (decision-63), and whether it holds sensitive data. The order of kinds is settled: approaches, then projects, then bio and experience, then articles and videos. The task orders the sources inside that. Documents only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A backlog doc lists each source with its kind, the owner's access needs and a seed order
- [x] #2 Sources with sensitive data are marked and kept out (decision-66)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Inventory and seed order written in doc-5 (backlog/docs/doc-5 - Persona-seed-inventory-sources-kinds-and-seed-order.md): one table per named source, a pet projects table, the sources not found locally and the open questions for the owner. Made read-only from listings, READMEs and manifests; no env, credential, archive data or note body was opened.
<!-- SECTION:NOTES:END -->
