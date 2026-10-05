---
id: TASK-107
title: >-
  Decide whether library code imports workspace packages through their root
  namespace
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - workflows
  - shell
  - conventions
dependencies: []
references:
  - pkg/@eserstack/workflows/run.ts
  - pkg/@eserstack/shell
  - .agents/skills/javascript-practices/references/modules.md
priority: low
ordinal: 107000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The modules rule says to import a package once and use dot notation when its mod.ts exposes sub-modules as namespaces. workflows (run.ts, list.ts, engine.ts and tests) and shell import sub-paths such as @eserstack/streams/span, @eserstack/primitives/results, @eserstack/functions/task and @eserstack/shell/exec, and other packages do the same; validate-code-conventions does not flag sub-paths. The root form loads a larger module graph, so decide first, then migrate or document the exception. Rule: javascript-practices: Imports.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The decision and its reason are recorded in javascript-practices references/modules.md
- [x] #2 workflows and shell follow it, with bundle size and circular-dependency checks run
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

final: modules.md (Imports) records the rule and why:
- Code and tests may import a published sub-path as a namespace named after the sub-module.
- Unpublished paths and self-imports are forbidden.
- CLI-first packages are imported through /mod.
- README examples keep the root form.

The exception list (runtime, type-only, JSON and CSS module default imports) matches what validate-code-conventions allows. I re-checked isAllowedImport and DEFAULT_ONLY_SPECIFIER. Every API in the corrected example exists. validate-code-conventions now reports 1368 files with no issues. Stage 1 recorded the bundle-size and cycle measurements. validate-circular-deps checks 0 packages because of a codebasefx bug (see crossUnitNeeds), so stage 1 ran its own cycle check instead.
<!-- SECTION:NOTES:END -->
