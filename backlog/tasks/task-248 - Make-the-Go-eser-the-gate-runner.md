---
id: TASK-248
title: Make the Go eser the gate runner
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
labels:
  - go
  - gate
  - ci
  - docs
milestone: m-3
dependencies:
  - TASK-244
  - TASK-245
  - TASK-246
  - TASK-247
  - TASK-231
priority: high
ordinal: 248000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Register every codebasefx validator as `eser codebase <id> [--fix]` and as a workflowfx tool named as in .eser/manifest.yml. The precommit and preflight workflows run through cmd/eser, with oxfmt, oxlint, tsc and node --test as shell steps. `pnpm ok`, `pnpm fix` and `pnpm preflight` call `go run ./cmd/eser`. `eser codebase install` writes git hooks that call the Go eser. The CI validate job runs it. Update the AGENTS.md Essential Commands and docs/agents/workflow.md in the same change.

Decisions this task waits on: decision-20 (The documented command form for the gate and scripts); decision-24 (When the gate runner moves to Go).

Plan key: M3-T7. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `eser ok` and `make ok` pass locally and in CI validate
- [ ] #2 The precommit and commit-msg hooks run the Go binary
- [ ] #3 Every validator id in the manifest resolves to a Go tool; the docs name `eser ok`
<!-- AC:END -->
