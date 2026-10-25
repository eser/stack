---
id: TASK-309
title: 'laroux-server: adapters/native build integration'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux-server
  - track-l
milestone: m-7
dependencies:
  - TASK-282
  - TASK-287
  - TASK-290
  - TASK-291
  - TASK-294
priority: medium
ordinal: 309000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 sections 10 and 20. laroux() as the FrameworkAdapter: route scan into virtual:laroux/routes, api-routes and proxy; the page-plus-route.ts build error; the rsc-plugin that applies /rsc/transforms per environment with resolveDirective and the webpack global names through define and inject; the reference table, the binding manifest and the island manifest as virtual modules; the env allow-list for the bundler; the build order rsc scan, rsc, client, ssr, prerender, finalize; the prerender worker for `prerender: true` and partial routes with staticParams and locales; the proxy-scope prerender check with `allowPrerender`; laroux-build-keys.json; the client-chunk secret scan; dist/server/index.js and entry.js; `--keep-assets`; the generated rsc, ssr and browser entry templates.

The new modules ship beside the old pipeline (additive in 5.x). Rules: javascript-practices, security-practices where the section touches input, keys or output.

Plan key: L5b. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The L-S1 fixtures build through laroux() and pass the conformance checks on Node
- [ ] #2 Tests show a prerendered route under a guarding proxy fails the build, and one under `allowPrerender` builds
- [ ] #3 A partial route's prelude and postponed state are written where L-S6 decided
- [ ] #4 The laroux-server README documents the change, and the gate passes
<!-- AC:END -->
