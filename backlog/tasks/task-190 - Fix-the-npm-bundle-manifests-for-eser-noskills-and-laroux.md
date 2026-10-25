---
id: TASK-190
title: 'Fix the npm bundle manifests for eser, noskills and laroux'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 17:16'
labels:
  - cli
  - noskills
  - laroux-server
  - npm
milestone: m-0
dependencies:
  - TASK-174
  - TASK-185
priority: medium
ordinal: 190000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fix the bundle manifests:
- noskills/scripts/npm-build.ts:158-166 declares no dependencies. Add the exact-pinned @eserstack/ajan-* optionalDependencies. Do not add koffi: the bridge loads through node:ffi (decision-37), and M1-T8 removes the koffi pin in cli/scripts/npm-build.ts:177, so this task leaves that line alone.
- Move esbuild to devDependencies in cli and noskills, through the integration agent.
- Raise the esbuild target from node18 to node26 in the cli, noskills and laroux-server npm-build scripts.
- noskills/README.md:8 names @eserstack/noskills; change it to the real npm name `noskills`.
One commit per package.

Decisions this task waits on: decision-14 (Minimum Node.js version).

Plan key: M0-T14. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The generated dist/package.json for eser and noskills declares the exact-pinned ajan-* optionalDependencies, and the noskills one has no koffi entry
- [x] #2 esbuild is a devDependency only; all three bundles target node26
- [x] #3 The `deno task cli preflight` npm build and consumer-install steps pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24. noskills/package.json gains the six @eserstack/ajan-* optionalDependencies (workspace:*), and noskills/scripts/npm-build.ts resolves them to the exact version with npmWorkspaceSpecifiers, as the cli build does; the generated noskills dist/package.json lists all six at 4.5.2 and has no koffi entry. The cli dist/package.json keeps its six pinned ajan-* entries; its koffi line is left for M1-T8 as the task says. esbuild moved from dependencies to devDependencies in cli and noskills (laroux-server already had it there). The esbuild target is node26 in the cli, noskills and laroux-server npm builds. noskills/README.md now says npm i -g noskills, and the JSR notices of noskills and laroux-server name the noskills and laroux npm packages. pnpm install updated pnpm-lock.yaml (the integration-agent rule of TASK-185). deno task cli preflight (npm-build-cli, -noskills, -laroux and npm-consumer-install included) and deno task cli ok passed. The task asks for one commit per package; nothing is committed in this session.
<!-- SECTION:NOTES:END -->
