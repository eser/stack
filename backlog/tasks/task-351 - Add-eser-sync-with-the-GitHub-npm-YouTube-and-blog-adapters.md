---
id: TASK-351
title: 'Add eser sync with the GitHub, npm, YouTube and blog adapters'
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
  - TASK-347
priority: medium
ordinal: 354000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
eser sync writes index records under content/_synced/<year>/: GitHub and npm/JSR facts only for what a project record names in repo: and package:, YouTube videos from RSS, blog posts from RSS. Mechanical records are published; an AI-written summary is a draft. Add the scheduled workflow that runs it and opens a pull request. The workflow needs the owner's approval before it lands.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each adapter has fixture tests and a timeout and a size bound
- [ ] #2 The scheduled workflow runs with the repository token only and opens a pull request
- [ ] #3 The owner has approved the workflow
- [ ] #4 The gate passes
<!-- AC:END -->
