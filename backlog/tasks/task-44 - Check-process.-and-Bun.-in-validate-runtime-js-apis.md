---
id: TASK-44
title: Check process.* and Bun.* in validate-runtime-js-apis
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - tooling
  - codebase
dependencies: []
references:
  - pkg/@eserstack/codebase/validate-runtime-js-apis.ts
priority: medium
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The validator only matches DENO_PATTERNS; direct process.env, process.exit and Bun.* usage in library code is unchecked. Its doc comment claimed otherwise and was corrected. Rule: javascript-practices: Cross-Runtime APIs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The validator reports process.* and Bun.* outside cross-runtime and tests, with a baseline if existing uses remain
- [x] #2 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

codebase: The code is complete: rules deno, process and bun; built-in skips for test files and standards/cross-runtime/; a per-file baseline with --write-baseline. The validator is registered in module.ts and the registry, with 18 tests passing. Running `deno task cli workflows run -e precommit --only validate-runtime-js-apis` fails with exactly 12 issues, all in three Node-only scripts outside this unit's paths, which need manifest excludes (see crossUnitNeeds). No library code under pkg/@eserstack violates the new rules.

Orchestrator: .eser/manifest.yml excludes the three Node-only scripts (.agents/hooks/decision-nudge.js, the skill validator and etc/scripts/release-notes-from-changelog.ts) from validate-runtime-js-apis, with the reason.
<!-- SECTION:NOTES:END -->
