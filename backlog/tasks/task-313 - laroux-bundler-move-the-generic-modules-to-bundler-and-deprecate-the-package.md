---
id: TASK-313
title: 'laroux-bundler: move the generic modules to bundler and deprecate the package'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux-bundler
  - bundler
  - track-l
milestone: m-7
dependencies:
  - TASK-290
  - TASK-291
  - TASK-309
priority: medium
ordinal: 313000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-46 removes laroux-bundler. Its generic parts (css-processor, build-cache, chunk-manifest and the plugin bodies doc-2 lists) have moved to bundler in TASK-291; its laroux-only parts (route-scanner, route-generator, framework-plugin, server-action-transform, client-action-stub) are replaced by laroux-server/adapters/native and /rsc/transforms. Mark the package deprecated, point its README and package.json at the replacements, and keep its exports working for existing apps until TASK-317. This also ends the laroux-react and laroux-bundler cycle (TASK-154) for new apps. Cross-package notes for each consumer.

The deprecation lasts one 5.x minor (decision-58): say so in the deprecation notice and the CHANGELOG.

Plan key: L5f. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 laroux-bundler is marked deprecated with pointers, and existing apps still build against it
- [ ] #2 No new code imports laroux-bundler (TASK-314's validator checks it)
- [ ] #3 TASK-154 has a note that new apps no longer have the cycle, and the gate passes
<!-- AC:END -->
