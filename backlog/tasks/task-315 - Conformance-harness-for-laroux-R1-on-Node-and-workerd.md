---
id: TASK-315
title: 'Conformance harness for laroux R1 on Node and workerd'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - laroux
  - ci
  - testing
  - track-l
milestone: m-7
dependencies:
  - TASK-308
  - TASK-309
  - TASK-312
priority: medium
ordinal: 315000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-3 section 21. A fixture matrix built with `laroux build` and served with `node dist/server/index.js` from a directory with no node_modules, and in `wrangler dev`: SSR and hydration, actions (round trip with a tree, in-process redirect, upload with nested File, streaming result, raw download), no-JS forms, queries with cache headers, islands (every strategy), Defer in both modes, prerender and partial prerender, sessions, i18n, the env split, composable handlers, the security regression suite of doc-3 section 21 (seeded by TASK-271), CSP, bots, and the S13 skew cases. Real-browser checks run in Playwright (decision-57), added as a root devDependency after the tooling-standards vetting; the CI change that installs its browsers goes to the owner for approval. A scheduled job runs the React contract suite and the fixtures against react@latest and react@canary (decision-59): a failure on latest is a bug, a failure on canary a warning. It reuses TASK-237's packed-package smoke job and replaces its "one action registry" check with one React per graph.

Plan key: L6b. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The matrix runs in CI on Linux on every change to laroux, laroux-server or bundler
- [ ] #2 Each case of doc-3 section 21's security regression suite is a passing test on both targets
- [ ] #3 The real-browser checks run in Playwright in Chromium, Firefox and WebKit, locally and in CI
- [ ] #4 The scheduled React latest and canary job exists and reports to the owner, once the owner approves the workflow change
<!-- AC:END -->
