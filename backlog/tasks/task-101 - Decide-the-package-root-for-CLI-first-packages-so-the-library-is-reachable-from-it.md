---
id: TASK-101
title: >-
  Decide the package root for CLI-first packages so the library is reachable
  from it
status: To Do
assignee: []
created_date: '2026-10-04 20:51'
labels:
  - ai
  - workflows
  - packaging
  - docs
dependencies: []
references:
  - pkg/@eserstack/ai/package.json
  - pkg/@eserstack/workflows/package.json
  - pkg/@eserstack/codebase/package.json
  - pkg/@eserstack/kit/package.json
  - pkg/@eserstack/noskills/package.json
  - pkg/@eserstack/laroux-server/package.json
  - .agents/skills/documentation-conventions/references/readmes.md
priority: low
ordinal: 101000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ai, workflows, codebase, kit, noskills and laroux-server map the "." export to the CLI main.ts, so `import * as ai from "@eserstack/ai"` gets only `main` and the library is reachable only at '/mod'. The README rule (namespace import of the package root, no sub-paths) cannot be followed for these packages. Either map "." to mod.ts and move the CLI to a ./cli or ./main export, which breaks `deno run jsr:@eserstack/<pkg>`, or write the '/mod' exception into readmes.md. Rule: documentation-conventions: README Import Pattern; TASK-51 tracks the README imports.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The decision is recorded, either in readmes.md or as an ADR
- [ ] #2 The package.json exports, main.ts JSDoc, READMEs and eser CLI wiring of the six packages follow it
- [ ] #3 deno task cli ok and the publish dry-run pass
<!-- AC:END -->
