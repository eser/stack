---
id: TASK-352
title: 'Generate eser.dev, llms.txt and the JSON feed, and the wildcard landing Worker'
status: To Do
assignee: []
created_date: '2026-10-25 09:50'
updated_date: '2026-10-25 10:02'
labels:
  - persona
  - track-p
  - code
  - laroux
milestone: m-9
dependencies:
  - TASK-348
  - TASK-349
  - TASK-312
priority: medium
ordinal: 355000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build the eser.dev site from content/ with laroux on the Workers target: personal pages, the project index, llms.txt and a JSON feed. Add the wildcard Worker for *.eser.dev. Its default landing shows the title and summary, a status badge, links to the repository, the package and the refs articles and videos, the install command and the Markdown body (decision-68). site: external hands a subdomain to the project's own site. A validator checks that the record and the DNS agree. DNS and deploy changes need the owner's approval.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 eser.dev builds and serves from the packed laroux packages on Workers
- [ ] #2 llms.txt and the feed omit drafts and unlisted records
- [ ] #3 A project without a site gets a default landing, and one with site: external does not
- [ ] #4 The owner has approved the DNS and deploy changes
<!-- AC:END -->
