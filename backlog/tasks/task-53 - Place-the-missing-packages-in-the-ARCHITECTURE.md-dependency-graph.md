---
id: TASK-53
title: Place the missing packages in the ARCHITECTURE.md dependency graph
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - docs
dependencies: []
references:
  - .github/ARCHITECTURE.md
priority: medium
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
.github/ARCHITECTURE.md's package dependency graph omits 11 packages: agents, ai, httpclient, kit, mux, noskills-client, noskills-server-worker, noskills-web, posts, webtransport, workflows. Rule: documentation-conventions: Docs Change With the Code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each package appears in its layer, checked against its package.json dependencies
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

docs-tooling: Re-checked with my own script: all 47 package.json packages are placed (ajan-<platform> counts once), and the only layer violation is the documented laroux-react/laroux-bundler cycle. Package descriptions match the READMEs (bundler: Rolldown/Deno.bundle; webtransport: certificate pinning; agents: git guard). Fixed an unasked removal by restoring @eserstack/directives in Layer 0, noted as documents only with no package.json.
<!-- SECTION:NOTES:END -->
