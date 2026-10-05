---
id: TASK-154
title: Break the dependency cycle between laroux-react and laroux-bundler
status: To Do
assignee: []
created_date: '2026-10-04 20:51'
labels:
  - laroux-react
  - laroux-bundler
  - architecture
dependencies: []
references:
  - pkg/@eserstack/laroux-bundler/package.json
  - pkg/@eserstack/laroux-react/package.json
  - pkg/@eserstack/laroux-react/client/bootstrap/lazy-loader.ts
  - .github/ARCHITECTURE.md
priority: low
ordinal: 154000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
laroux-bundler/package.json:26 depends on @eserstack/laroux-react and imports its protocol, while laroux-react/package.json:18 depends on @eserstack/laroux-bundler and imports it, for example the ChunkManifest type in client/bootstrap/lazy-loader.ts:9. .github/ARCHITECTURE.md:55 records this as the one exception to the layer rule. Rule: coding-practices: Circular Dependencies.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The shared protocol or types move so the dependency points one way
- [ ] #2 The exception is removed from ARCHITECTURE.md
- [ ] #3 deno task cli codebase validate-circular-deps passes
<!-- AC:END -->
