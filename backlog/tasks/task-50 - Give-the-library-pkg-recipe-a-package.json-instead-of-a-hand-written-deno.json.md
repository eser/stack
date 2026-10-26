---
id: TASK-50
title: Give the library-pkg recipe a package.json instead of a hand-written deno.json
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - tooling
  - kit
dependencies: []
references:
  - .eser/recipes/library-pkg/
priority: high
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
.eser/recipes/library-pkg/ ships a hand-written deno.json and no package.json, the opposite of the rule that package.json is the source of truth and deno.json is generated. Every new package starts from it. Rule: tooling-standards repo-conventions.md: Adding a Workspace Package.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The recipe has package.json (name, type module, exports, workspace deps) and no deno.json
- [x] #2 A package created from it passes deno task cli ok
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

docs-tooling: The recipe has package.json and no deno.json. I checked it in a scratch import-map workspace pointing at the repo's primitives: deno test passes (2 tests), deno check --doc-only README.md passes, and lint and fmt are clean under the root rule set. The package.json version 0.0.0 is safe: no validator compares package versions, gen-jsr-manifests stamps deno.json from VERSION, and `eser codebase versions` sets every workspace module to the target version. .eser/recipes.json still lists the deleted deno.json (crossUnitNeeds), so `eser kit new library-pkg` fails until it is updated.

Orchestrator: .eser/recipes.json now lists recipes/library-pkg/package.json instead of the deleted deno.json, with a workspace-package description, and the README sample output matches.
<!-- SECTION:NOTES:END -->
