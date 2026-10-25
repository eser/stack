---
id: TASK-241
title: Prepare the first release after the cutover for the owner
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
labels:
  - release
  - docs
milestone: m-2
dependencies:
  - TASK-235
  - TASK-236
  - TASK-237
  - TASK-239
  - TASK-240
priority: high
ordinal: 241000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decisions release-version and first-release-timing:
- Prepare the version bump with the release command in dry-run mode, and set the install.sh npm-only gate variable to that version.
- Finish the CHANGELOG Unreleased, Migration section: npm library packages, the Node floor, the binary channels status and the forwarding stubs.
- Run preflight.
- Write a checklist for the owner covering:
  - the npm bootstraps
  - whether to wait for M3-T11
  - applying the M2-T10 patches to the template repos and the homebrew-tap
  - the JSR freeze state
  - confirming that install.sh decides correctly against the new release's archive list
Do not tag or publish.

Decisions this task waits on: decision-11 (When install.sh and install.ps1 stop offering eser, noskills and laroux); decision-13 (When the first release after the cutover happens); decision-23 (How the laroux template repos and the homebrew-tap migrate); decision-29 (Version of the first release after the cutover).

Plan key: M2-T9. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `pnpm cli preflight` passes
- [ ] #2 The Migration section covers every break from M0 to M2
- [ ] #3 The checklist is in the task; no tag, push or publish was made
<!-- AC:END -->
