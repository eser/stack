---
id: TASK-356
title: Decide where the private layer lives and how an agent reaches it
status: To Do
assignee: []
created_date: '2026-10-25 09:50'
updated_date: '2026-10-25 10:02'
labels:
  - persona
  - track-p
  - decision
  - owner-input
milestone: m-9
dependencies: []
priority: low
ordinal: 359000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The direction is settled in decision-66: a separate private repository with the same schema and CLI, bound from a local path and ignored when absent. Decide the path, the first private kind, how an agent on the owner's machine is allowed to read it, and what the cache and snapshot do with private records (nothing leaves the machine). Record the answer as a decision.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A decision record names the repository, the access model and the first use
<!-- AC:END -->
