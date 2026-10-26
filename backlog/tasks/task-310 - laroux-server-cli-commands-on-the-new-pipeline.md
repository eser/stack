---
id: TASK-310
title: 'laroux-server: cli/ commands on the new pipeline'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux-server
  - track-l
milestone: m-7
dependencies:
  - TASK-309
priority: medium
ordinal: 310000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The `laroux` bin (decision-47): init, dev, build [--keep-assets n] [--target node|workerd], serve and preview [--target], loading laroux.config.ts through Node type stripping and driving the host through the adapter. `eser laroux` forwards to it. init keeps cloning the templates (TASK-240) until M3's kitfx takes over.

The new modules ship beside the old pipeline (additive in 5.x). Rules: javascript-practices, security-practices where the section touches input, keys or output.

Plan key: L5c. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each command has a test against a fixture, and `laroux --help` lists them with their flags
- [ ] #2 `laroux build --target workerd` hands over to the Workers target (TASK-312)
- [ ] #3 The laroux-server README documents the change, and the gate passes
<!-- AC:END -->
