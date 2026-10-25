---
id: TASK-291
title: 'bundler: CSS, assets, env, fonts and images plugins for the host'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - bundler
  - track-l
milestone: m-7
dependencies:
  - TASK-290
priority: medium
ordinal: 291000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The core plugins from doc-2 on the new host: Lightning CSS, CSS Modules as JS and Tailwind v4 with CSS emitted per chunk and recorded in the manifest; assets (`?url`, `?raw`, `?inline`, `new URL(..., import.meta.url)`, the public dir); fonts; sharp images as an optional peer; and the env plugin.

The env plugin loads .env, .env.local, .env.[mode] and .env.[mode].local into the build's process.env, defines import.meta.env MODE, DEV, PROD, SSR and BASE_URL per environment, and exposes to client environments only the names and values in an allow-list that the caller passes. It stays laroux-free; laroux-server's adapter computes the allow-list from the typed env schema (doc-3 section 14). Move the plugin bodies doc-2 lists from laroux-bundler (cross-package notes).

Plan key: L2b. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each plugin has fixture tests on the host, including CSS per chunk in the manifest and a Tailwind build
- [ ] #2 A test shows a client environment sees only allow-listed env names, and a non-listed `import.meta.env.X` stays undefined
- [ ] #3 The gate passes
<!-- AC:END -->
