---
id: TASK-237
title: 'laroux: ship a real npm package and smoke-test dev, build and serve on Node'
status: In Progress
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-27 12:40'
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
- [x] #2 A test shows one React copy and one action-registry instance at run time
- [x] #3 laroux-server/scripts/npm-build.ts is deleted, and the README install and usage lines match
- [x] #4 A new laroux app created from the recipe runs dev, build and serve on Node with no config file, so the zero-configuration claim holds
- [x] #5 The laroux-app recipe lists the @eserstack laroux packages from npm (no npm:@jsr/ specifiers) and laroux as a devDependency, its scripts call the laroux bin, and it no longer imports the nonexistent @eserstack/laroux-core
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner decision 2026-10-23 (decision-47): app code imports the scoped @eserstack packages from npm; the bare npm package laroux is the tool and its bin.

Implemented on 2026-10-27:

- The npm package `laroux` is a new workspace package, pkg/@eserstack/laroux-bin (name `laroux`). Its cli.ts calls the new `run()` export of @eserstack/laroux-server/cli; `pnpm -r build` emits dist/cli.js with build-library.ts, and `publishConfig.bin` points the `laroux` bin at it. Its only dependency is `@eserstack/laroux-server: workspace:*`, which pnpm packs as the exact version. It has no `exports`, so gen-library-manifests and publish-libraries leave it alone; the publish job publishes it from the workspace right after the libraries. react, react-dom, rolldown, sharp, lightningcss and tailwind come in as dependencies of laroux-server, laroux-react, laroux-bundler and bundler, so nothing is inlined. A thin package and not laroux-server published under a second name: the app's server bundle keeps `@eserstack/laroux-server` external and resolves it from the app's node_modules, and a second copy of the same code under the name `laroux` would split the action registry again.
- laroux-server/scripts/npm-build.ts is deleted, with laroux-server's esbuild devDependency, the npm-build-laroux preflight step and the laroux bundle steps of the smoke-test and publish jobs. preflight-plugin-bins.ts installs `laroux` from its packed tarball with its closure instead of the saved bundle. The npm-build externals test and npm-externals.ts now name the cli and noskills builds only.
- etc/scripts/preflight-laroux-app.ts (tests in preflight-laroux-app.test.ts) scaffolds the recipe with `go run ./cmd/eser kit add laroux-app --registry .eser/recipes.json`, deletes laroux.config.ts, points the app's packed dependencies and an `overrides` map at the tarballs of etc/temp/npm-packs, puts the @eserstack scope on 127.0.0.1:9 and installs with npm under the OS temp dir. The lockfile must resolve every packed name from a tarball and hold one react, one react-dom and one @eserstack/laroux-server. Then `node --run dev` (one edit of the home page, the HMR update message on /hmr, the edit on the page), a home page that registers an action through @eserstack/laroux-server/action-registry, `node --run build` (the server bundle imports the registry and carries no copy of it) and `node --run serve` (the page shows one registered action). A module.registerHooks resolve hook, loaded through NODE_OPTIONS, records every module file dev and serve load; react, react-dom and @eserstack/laroux-server must each load from one directory, and in serve action-registry.js from one file inside that laroux-server. `--app-dir` keeps the install for further checks (TASK-315). It is the preflight step laroux-app (after library-consumer) and the reusable workflow .github/workflows/laroux-smoke.yml (workflow_call and workflow_dispatch; Linux ubuntu-24.04-arm and macos-latest), which build.yml calls as the laroux-smoke job after validate, skipped on tags like cross-runtime-test.
- The servers need the ajan native library: @eserstack/logging's configure hook rejects when it never loaded (logging/logger.ts, registerConfigureHook), and the packed ajan-* platform packages carry no library. The script passes the library `make ajan-lib` built through ESER_AJAN_LIB_PATH; an npm install of a release gets it from the platform package. ESER_AJAN=disabled does not help: `laroux build` then fails in that same hook. Left as found; it is not a laroux packaging defect.
- Verified locally on macOS arm64, Node 26.12.1: `node etc/scripts/preflight-laroux-app.ts` printed "laroux dev: 289 module files, one react, one react-dom and one @eserstack/laroux-server", "laroux build: 5 server modules; they import the action registry and carry no copy of it", "laroux serve: 269 module files, one react, one react-dom and one @eserstack/laroux-server, one action registry" and "laroux app preflight: OK". The recipe's laroux.config.ts, put back, also builds. The tests of preflight-laroux-app.test.ts include a second React and a second registry, which fail the check.
- AC #5 needed no recipe change: .eser/recipes.json and the template already list @eserstack/laroux and @eserstack/laroux-react from npm and laroux in npmDev (TASK-362), the scripts are `laroux dev|build|serve`, and the imports are @eserstack/laroux/config and /router. Two tests pin it: no npm:/jsr: specifier and scripts that call the laroux bin, and every @eserstack import of the recipe names an export of a workspace package (laroux-core has none).
- Gate: `pnpm ok` printed "All checks passed!". `pnpm preflight` passed every step (laroux-app in 8.8 s, plugin-bins with laroux from its tarball) except library-consumer, whose tsc check fails on @eserstack/ajan/dist/ffi/offload.d.ts ("Cannot find name 'node:worker_threads'", TS2591): the consumer declares no @types/node, and offload.ts (83f6ab36, TASK-238) and the consumer check (96ffc469, TASK-236) met only in the merge to main. This change does not touch either; it needs its own fix.
- Open for AC #1: the laroux-smoke job runs on Linux and macOS only after a push; it is not verified until that run passes.
- Decisions taken conservatively, for the owner: react and react-dom stay dependencies of laroux-server and laroux-react (decision-59 makes them peers of @eserstack/laroux in track L); the recipe keeps its commented laroux.config.ts and the test removes it to prove the zero-configuration claim; the directory is named laroux-bin; npm, not pnpm, installs the smoke app, as kit does (not tried with pnpm: its strict layout hides transitive dependencies such as @eserstack/laroux-server from the app root, where the server bundle resolves its externals).
<!-- SECTION:NOTES:END -->
