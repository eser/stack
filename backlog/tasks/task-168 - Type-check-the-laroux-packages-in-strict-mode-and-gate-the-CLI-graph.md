---
id: TASK-168
title: Type-check the laroux packages in strict mode and gate the CLI graph
status: Done
assignee: []
created_date: '2026-10-05 00:58'
updated_date: '2026-10-15 19:34'
labels:
  - laroux
  - types
dependencies: []
priority: medium
ordinal: 168000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
pkg/@eserstack/laroux-react, laroux-server and laroux-bundler each have a tsconfig.json that sets only jsx options. Deno then type-checks their files with TypeScript's non-strict defaults. The same files checked from pkg/@eserstack/cli/main.ts are checked strictly, so strict-mode errors pass the package-scoped checks but break cli publish and compile. The precommit gate runs `deno check ./pkg/@eserstack/*/mod.ts`, and cli has no mod.ts, so the CLI graph is not checked at all.

Stage 4 fixed the 3 errors the CLI graph reported (render-app.tsx, rsc-flight-renderer.ts). Adding "strict": true to these tsconfig files reports 24 more errors in laroux-react: client/bootstrap/smart-refresh.tsx (most of them), span-renderer.tsx:51 and runtime/navigation/link-navigation.test.ts:100. It also touches gate config in .eser/manifest.yml, which is outside this unit's paths. That is a cross-package cleanup beyond the stage-4 tasks, so it is not done here.

Decision: remove the jsx-only tsconfig.json overrides, or set strict: true in them, so the laroux packages type-check strictly everywhere, and fix the errors. Add pkg/@eserstack/cli/main.ts to the deno-type-check step in .eser/manifest.yml.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The laroux packages type-check with strict on, or their tsconfig.json overrides are removed so Deno's strict defaults apply
- [x] #2 The precommit gate type-checks pkg/@eserstack/cli/main.ts or every package entry point, not only mod.ts files
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in round 3 of the autonomous backlog run (2026-10-05); deno task cli ok passes.

AC1 was met by another unit: the laroux tsconfig files extend the strict root config. AC2 is met: ./pkg/@eserstack/cli/main.ts is in the deno-type-check step and in the check script.
<!-- SECTION:NOTES:END -->
