---
id: TASK-253
title: >-
  Build forwarding stub binaries for the retired laroux and noskills archive
  names
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
labels:
  - go
  - distribution
  - migration
milestone: m-3
dependencies:
  - TASK-251
priority: high
ordinal: 253000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Installed v4.5.x laroux and noskills binaries run the old update.ts. A release with no matching archive gives them the old checksum and download failure (update.ts:124-155). Per decision legacy-binary-updates, add cmd/legacy-forwarder, a tiny Go program built once per name.
- The laroux stub runs `npx --yes laroux@<version> <args>` when npx exists, and otherwise prints `npm i -g laroux`. It also answers `update` and `version`.
- The noskills stub works the same way for `noskills` until M4-T6 replaces it with the real binary.
`eser dev compile` (M3-T10) packages the stubs as `laroux-v<ver>-<triple>` and `noskills-v<ver>-<triple>` archives in SHA256SUMS.txt, signed like the others. Preflight runs the old update.ts flow from a v4.5.2-named binary fixture against a local release and checks that the stub replaces it and forwards.

Decisions this task waits on: decision-9 (What installed v4.5.x laroux and noskills binaries update to); decision-38 (Release archive names).

Plan key: M3-T14. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tests cover forwarding with a fake npx and the message without one
- [ ] #2 The preflight test proves a v4.5.2-named laroux and noskills self-update to the stubs, and the stubs then run the npm packages
- [ ] #3 The stub retirement rule is recorded in ADR 0005
<!-- AC:END -->
