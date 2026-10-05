---
id: TASK-94
title: Fix the deno doc --lint errors in the laroux-server public API
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - laroux-server
  - docs
dependencies: []
references:
  - pkg/@eserstack/laroux-server/options.ts
  - pkg/@eserstack/laroux-server/adapters/react/mod.ts
priority: low
ordinal: 94000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`deno doc --lint` on the laroux-server entry points (main.ts, config/load-config.ts, adapters/react/mod.ts, domain/action-registry.ts, module.ts, cli.ts) reports 27 errors. Most are private-type-ref: ServerOptions references Renderer, HtmlShellBuilder, FrameworkPlugin and CssPlugin; AppConfig references the Resolved*Config types; BundlerConfig references ModuleReference; SSRResult and the payload helpers reference RSCChunk; renderApp references RenderAppProps. BundlerConfig also lacks JSDoc. Rule: documentation-conventions: Docs Change With the Code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The referenced port and config types are exported from an entry point and documented
- [x] #2 deno doc --lint on the six entry points reports no errors
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

laroux: I re-ran deno doc --lint on main.ts, config/load-config.ts, adapters/react/mod.ts, domain/action-registry.ts, module.ts and cli.ts: 'Checked 6 files', 0 errors.
<!-- SECTION:NOTES:END -->
