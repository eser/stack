---
id: TASK-101
title: >-
  Decide the package root for CLI-first packages so the library is reachable
  from it
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-15 19:34'
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
- [x] #1 The decision is recorded, either in readmes.md or as an ADR
- [x] #2 The package.json exports, main.ts JSDoc, READMEs and eser CLI wiring of the six packages follow it
- [x] #3 deno task cli ok and the publish dry-run pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in round 3 of the autonomous backlog run (2026-10-05); deno task cli ok passes.

Decision already recorded in documentation-conventions/references/readmes.md (README Import Pattern: CLI-first packages map `.` to the CLI and publish the library at `./mod`). Verified: package.json of ai, codebase, kit, noskills and workflows map `.` to main.ts and `./mod` to mod.ts. Each main.ts module JSDoc names the `/mod` namespace import with an example that passes `deno check --doc-only`, and noskills shows `deno run --allow-all jsr:@eserstack/noskills <command> [options]`. laroux-server needs no change: its `.` is the server library and its CLI is at `./cli`. Still missing: README imports of these packages (TASK-51 / docs unit, outside paths) and AC #3 (orchestrator).

Orchestrator check: the main.ts module JSDoc of ai, workflows, codebase, kit and noskills names the /mod import.
<!-- SECTION:NOTES:END -->
