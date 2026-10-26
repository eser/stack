---
id: TASK-236
title: Publish the libraries to npm from CI and verify them in preflight
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
labels:
  - npm
  - ci
  - release
milestone: m-2
dependencies:
  - TASK-232
  - TASK-233
  - TASK-234
  - TASK-235
priority: high
ordinal: 236000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a library publish step to the publish job: `pnpm -r build`, then `pnpm -r publish --provenance --access public --no-git-checks`. It skips private packages such as test-kit, and versions already on npm, the way publish-ajan does.
Add preflight steps for:
- the publish dry run
- a consumer smoke test that installs all packed tarballs together into a scratch Node 26 project, with an `overrides` map from each @eserstack/* name to its tarball so the rewritten workspace ranges resolve locally, then imports every export entry
List the @eserstack names that do not exist on npm yet, so the owner can bootstrap them and set up trusted publishing. Record this list in docs/agents/release-and-ci.md.

Decisions this task waits on: decision-5 (Keep publishing to JSR or move the libraries to npm only).

Plan key: M2-T5. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `pnpm cli preflight` runs the library dry run and the consumer smoke test, and both pass with no registry access for @eserstack names
- [ ] #2 The publish job is idempotent per version, skips private packages, and passes in dry-run mode
- [ ] #3 The bootstrap list is attached; no agent publishes
<!-- AC:END -->
