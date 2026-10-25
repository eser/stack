---
id: TASK-255
title: Delete the TypeScript eser dispatcher and the twins now in Go
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
labels:
  - cli
  - codebase
  - cleanup
  - docs
milestone: m-3
dependencies:
  - TASK-254
priority: medium
ordinal: 255000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Delete the dispatch in pkg/@eserstack/cli, keeping the directory for the npm launcher. Delete codebase/cli-system, the TS release, versions and changelog commands, the TS validators that now have Go versions, the TS workflows engine CLI, the kit recipe applier and handlers, the cs CLI and fallback, and the ai commands. Keep any library module that has a live importer. Update READMEs, skills and docs for the Go-first CLI.

Decisions this task waits on: decision-22 (Where the Go and TypeScript boundary sits).

Plan key: M3-T12. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No TypeScript entry point remains for a command with a Go implementation
- [ ] #2 `eser laroux --help`, `eser posts --help` and `eser noskills --help` still run the Node CLIs through forwarding
- [ ] #3 The gate is green; the code-conventions baseline only shrinks
<!-- AC:END -->
