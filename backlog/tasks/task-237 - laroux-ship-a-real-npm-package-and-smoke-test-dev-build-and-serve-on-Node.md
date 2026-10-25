---
id: TASK-237
title: 'laroux: ship a real npm package and smoke-test dev, build and serve on Node'
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-23 17:36'
labels:
  - laroux
  - npm
  - ci
  - frontend
milestone: m-2
dependencies:
  - TASK-232
  - TASK-233
  - TASK-234
  - TASK-236
priority: high
ordinal: 237000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the single-file esbuild bundle in laroux-server/scripts/npm-build.ts with the M2-T1 emit. bin `laroux` points at dist/cli.js, and react, react-dom, rolldown, sharp, lightningcss and tailwind become dependencies or peers instead of being inlined, so there is no duplicate React and no split action registry. Add a CI job that installs the packed laroux together with the packed workspace libraries (the M2-T5 overrides), scaffolds the laroux-app recipe, then runs dev (with one HMR edit), build and serve.

Make the CI job reusable: track L's conformance harness (TASK-315) runs on it and replaces the one-action-registry check with one React per graph.

Plan key: M2-T6. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The CI job passes on Linux and macOS
- [ ] #2 A test shows one React copy and one action-registry instance at run time
- [ ] #3 laroux-server/scripts/npm-build.ts is deleted, and the README install and usage lines match
- [ ] #4 A new laroux app created from the recipe runs dev, build and serve on Node with no config file, so the zero-configuration claim holds
- [ ] #5 The laroux-app recipe lists the @eserstack laroux packages from npm (no npm:@jsr/ specifiers) and laroux as a devDependency, its scripts call the laroux bin, and it no longer imports the nonexistent @eserstack/laroux-core
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner decision 2026-10-23 (decision-47): app code imports the scoped @eserstack packages from npm; the bare npm package laroux is the tool and its bin.
<!-- SECTION:NOTES:END -->
