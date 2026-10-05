---
id: TASK-46
title: Add timeouts and standard runners to the small workflows
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-09-25 21:50'
labels:
  - ci
dependencies: []
references:
  - .github/workflows/
priority: medium
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pr-labeler.yml, sync-issue-labels.yml and update-contributors.yml have no timeout-minutes (6-hour default), and those three plus codeql.yml run on ubuntu-latest while build.yml uses the ubicloud and ubuntu-24.04-arm labels. Needs the owner's approval as a workflow change. Rule: release-and-ci github-actions.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every job sets timeout-minutes
- [x] #2 Runner labels follow the pipeline's, or the exception is commented
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
pr-labeler, sync-issue-labels and update-contributors now run on ubuntu-24.04-arm with timeout-minutes 5, 5 and 10. codeql.yml stays on ubuntu-latest (x64) with the reason in a comment, and the release-and-ci runner rule names that exception.
<!-- SECTION:NOTES:END -->
