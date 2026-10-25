---
id: TASK-314
title: 'codebase: laroux package-boundary and workerd-graph validators'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - codebase
  - go
  - validators
  - track-l
milestone: m-7
dependencies:
  - TASK-246
  - TASK-247
  - TASK-241
priority: medium
ordinal: 314000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-46's validator, as a Go codebasefx validator on the M0-T16 lexer (decision-32), run in precommit:
- laroux-server/runtime/ never imports cli/ or dev/
- bundler never imports react or a laroux package
- @eserstack/laroux never imports @eserstack/bundler or laroux-server
- nothing imports @tanstack/*
- no new code imports laroux-bundler or laroux-react once they are deprecated (an allowlist holds today's importers and only shrinks)
The workerd-graph check (no server graph reaches node:ffi or an ajan binding outside the wasi profile, decision-45 as amended on 2026-10-24) runs at build time in laroux-server (TASK-312, TASK-318) because it needs the bundle graph; this task adds a fixture test for it to the conformance suite.

Plan key: L6a. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Fixture tests fail for each forbidden import and pass for the allowed ones
- [ ] #2 The validator runs in precommit through .eser/manifest.yml, and the gate passes
<!-- AC:END -->
