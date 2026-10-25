---
id: TASK-290
title: 'bundler: environment host, AppBuilder, EnvironmentManifest, define, inject and alias entries'
status: To Do
assignee: []
created_date: '2026-10-24 01:30'
labels:
  - bundler
  - track-l
milestone: m-7
dependencies:
  - TASK-282
  - TASK-241
priority: medium
ordinal: 290000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
doc-2's @eserstack/bundler host section, shipped as the new `./host` subpath beside the existing backend API (additive in 5.x, doc-3 section 2):
- named environments, each one rolldown() call with platform, conditions, define, jsx, external and noExternal, input, output and codeSplitting; server-consumer environments default to noExternal: true, with a serverExternalPackages allow-list that fails when a listed package depends on react
- HostPlugin with the fixed extra-hook list (enforce, applyToEnvironment, config, configEnvironment, configResolved, buildApp, configureDevServer, hotUpdate)
- AppBuilder with ordered builds, write:false scan passes and shared state
- a per-environment EnvironmentManifest built in generateBundle
- generic define and inject, which laroux-server uses to supply the webpack global names (doc-3 section 2)
- opaque alias entries in the module map, `{ id, target }`, resolving to the same module and chunks, with no knowledge of holding (doc-3 section 8.2)
The bundler stays free of React and laroux; TASK-314's validator checks it. Use the L-S1 prototype as the reference.

Plan key: L2a. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `@eserstack/bundler/host` builds the L-S1 fixture's four environments, and the existing backend API still passes its tests
- [ ] #2 A test builds an alias entry and shows it resolves to the target's chunk without loading it twice
- [ ] #3 A test shows serverExternalPackages fails for a package that depends on react
- [ ] #4 The bundler README documents ./host, and the gate passes
<!-- AC:END -->
