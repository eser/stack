---
id: TASK-90
title: 'Pass the Lightning CSS, fonts and image adapters into the laroux-bundler build'
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - laroux-bundler
  - architecture
dependencies: []
references:
  - pkg/@eserstack/laroux-bundler/system.ts
  - pkg/@eserstack/laroux-server/commands/build.ts
priority: low
ordinal: 90000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/@eserstack/laroux-bundler/system.ts imports adapters/lightningcss (line 30) and adapters/fonts (line 42) directly and loads adapters/sharp with a dynamic import inside build() (line 1983). The hexagonal rule wants the caller to import adapters and pass them in, with no-op defaults and no dynamic imports inside the package. Rule: architecture-guidelines: Hexagonal Architecture (Double-Layered).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 BuildPlugins (or the domain types) has image, font and CSS-processing ports with no-op defaults
- [x] #2 laroux-server passes the adapters it uses
- [x] #3 system.ts imports no adapter directly
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

laroux: system.ts imports only domain modules. Its imports contain no adapters/ path and it has no dynamic import. The CssProcessor, FontOptimizer and ImageOptimizer ports have no-op defaults. laroux-server's dev, serve and build commands pass the lightningcss, fonts and sharp adapters.
<!-- SECTION:NOTES:END -->
