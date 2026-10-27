---
id: TASK-368
title: 'release: keep the noskills platform binaries executable when pnpm packs them'
status: To Do
assignee: []
created_date: '2026-10-27 09:00'
labels:
  - release
  - noskills
  - bug
  - owner-input
dependencies: []
priority: high
ordinal: 371000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found during TASK-252: `pnpm pack` writes the staged noskills binary of a `noskills-<platform>` package at mode 0644, while `npm pack` keeps 0755. With a pnpm-packed platform tarball, `eser noskills --help` failed with EACCES. The publish job in .github/workflows/build.yml publishes these platform packages with `pnpm publish`, so a published binary may not be executable unless the launcher sets the mode before it runs it. etc/scripts/preflight-noskills-launcher.ts and the TASK-252 plugin-bins check pack the platform package with npm, so preflight does not catch it. No noskills-<platform> package is on npm yet (TASK-236 bootstrap list), so no broken binary has shipped; fix it before the first publish, in the publish job (pack with npm, or set the mode before `pnpm publish`) or in the launcher; either is a release or workflow change for the owner to approve.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The binary inside every packed noskills-<platform> tarball has an executable mode, checked by a preflight step that packs the way the publish job does
- [ ] #2 A packed platform package run through the launcher answers `--help` with no EACCES
<!-- AC:END -->
