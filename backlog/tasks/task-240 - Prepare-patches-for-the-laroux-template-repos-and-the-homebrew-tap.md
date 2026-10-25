---
id: TASK-240
title: Prepare patches for the laroux template repos and the homebrew-tap
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
labels:
  - laroux
  - distribution
  - homebrew
  - external
milestone: m-2
dependencies:
  - TASK-237
priority: medium
ordinal: 240000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decision external-repos, these repos also need the migration, and agents never push to them:
- `laroux init` clones gh:eser/laroux-template-{minimal,blog,dashboard,docs} (laroux-server/commands/init.ts:70).
- The eser/homebrew-tap repo keeps eser, noskills and laroux formulas.
In scratch clones outside the repo:
- Move each template to package.json scripts on `laroux dev|build|serve`, npm dependencies and no deno.json, and check that each scaffolds and builds with the packed laroux from M2-T6.
- Prepare a homebrew-tap patch that deprecates the laroux formula with a `deprecate!` pointing to npm, and that pauses or forwards the eser and noskills formulas per decision binaries.
Hand the patches to the owner.

Decisions this task waits on: decision-23 (How the laroux template repos and the homebrew-tap migrate).

The template patches here target today's pipeline. A second round follows the R1 recipe shape after TASK-316.

Plan key: M2-T10. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each template patch scaffolds through `laroux init` from a local path and passes `laroux build` with the packed laroux
- [ ] #2 The homebrew-tap patch passes `brew audit` in dry-run mode
- [ ] #3 The patches and apply instructions are in the task; nothing was pushed
<!-- AC:END -->
