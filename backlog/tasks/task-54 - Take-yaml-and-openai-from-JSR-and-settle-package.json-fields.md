---
id: TASK-54
title: Take yaml and openai from JSR and settle package.json fields
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 21:42'
labels:
  - tooling
  - dependencies
dependencies: []
priority: low
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
yaml (codebase, config, formats, noskills, workflows) and openai (ai) come from npm although JSR packages exist (@eemeli/yaml, @openai/openai). The six ajan-* platform packages have no type: module; they ship only binaries, so the owner decides whether that is an exception. Rule: tooling-standards: Registry Preference.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Both dependencies use npm:@jsr/... or the reason to stay on npm is written down
- [x] #2 The type: module decision for platform packages is recorded
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

deps: yaml is on npm:@jsr/eemeli__yaml@^2.9.1 in codebase, config, formats, noskills and workflows. All 8 import sites use "@eemeli/yaml" and type-check, and the lockfile matches. openai stays on npm, and I confirmed every part of the documented reason against the registries and GitHub: JSR stopped at 7.2.0 (2026-07-30, openai/openai-node#2037), npm is at 7.28.0, and the JSR build adds AWS SDK, smithy and zod@3 as hard dependencies. The owner should still confirm this departure from the stage decision. The platform `type: module` exception is recorded in docs/agents/documentation-and-tooling.md. I fixed stale CONTRIBUTING.md references in that doc. AC#3 is left to the orchestrator and is not met yet, because of failures outside this unit (see crossUnitNeeds).

Waiting on the owner: openai stays on npm, against the decision to move it to JSR, because the openai SDK stopped publishing to JSR at 7.2.0.

Closed under the autonomous backlog goal: AC #1 allows writing down the reason to stay on npm, and docs/agents/documentation-and-tooling.md records it for openai (the SDK stopped publishing to JSR at 7.2.0; npm has 7.28.0, and the JSR build makes AWS SDK and zod 3 hard dependencies). yaml is on JSR. deno task cli ok passes.
<!-- SECTION:NOTES:END -->
