---
id: TASK-255
title: Delete the TypeScript eser dispatcher and the twins now in Go
status: In Progress
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-11-17 16:36'
labels:
  - cli
  - codebase
  - cleanup
  - docs
milestone: m-3
dependencies:
  - TASK-254
priority: medium
ordinal: 255000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Delete the dispatch in pkg/@eserstack/cli, keeping the directory for the npm launcher. Delete codebase/cli-system, the TS release, versions and changelog commands, the TS validators that now have Go versions, the TS workflows engine CLI, the kit recipe applier and handlers, the cs CLI and fallback, and the ai commands. Keep any library module that has a live importer. Update READMEs, skills and docs for the Go-first CLI.

Decisions this task waits on: decision-22 (Where the Go and TypeScript boundary sits).

Plan key: M3-T12. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No TypeScript entry point remains for a command with a Go implementation
- [ ] #2 `eser laroux --help`, `eser posts --help` and `eser noskills --help` still run the Node CLIs through forwarding
- [ ] #3 The gate is green; the code-conventions baseline only shrinks
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Deleting pkg/@eserstack/cli/scripts/npm-build.ts also removes the last users of @eserstack/codebase/npm-externals and npm-workspace-specifiers once TASK-262 deletes the noskills one: delete both modules, their tests and exports, and the esbuild devDependency of cli. codebase/cli-system is not deleted: TASK-403 moves it to @eserstack/shell, because laroux keeps a TypeScript bin with the system commands.

Owner decision (2026-11-17): port every TS-only eser command to Go before deleting the TS CLI: the codebase alias `.`, workflows `wf`, noskills `nos`, `codebase commitmsg` (on aifx), `ajan version`, the `system` group with `info` and `completions`, and `codebase validate-code-conventions --write-baseline` (codebasefx.WriteCodeConventionsBaseline exists, nothing calls it).

Owner decision (2026-11-17): delete the TS CLI modules now and stay on 5.x, without a deprecation period or a major bump; the npm-externals and npm-workspace-specifiers exports removed by TASK-254 stay removed.

Step 1 (2026-11-17): the Go eser has every TS-only command: the aliases codebase . and workflows wf and the noskills alias nos (forward.go pluginAliases), the system group (install, uninstall, update, completions --shell, version, doctor, info), ajan version (the linked Go library), codebase validate-code-conventions --write-baseline (byte-identical to the TS writer on this repo) and codebase commitmsg on aifx (cmd/eser/codebase_commitmsg.go). clifx exports CompletionScript. Tests first for each.

Step 2a (2026-11-17): pkg/@eserstack/cli is deleted (the dispatcher, the manifest script runner, plugin resolution, native-tools and ajan version, all in the Go eser now) and `pnpm cli` runs `go run ./cmd/eser`. The node-ffi-cli CI job ran that package under node:ffi; the cross-runtime-test job keeps loading the bridge from an npm install with --require-native, so the job is removed with the package. The mise test-ffi task loads @eserstack/ajan directly. Next: the TypeScript twins in codebase, workflows, kit, cs and ai.

Step 2b (2026-11-18): codebase keeps its library (git, package, workspace-discovery, the native-function types, changelog-text for etc/scripts/release-notes-from-changelog.ts, and the two deprecated shims); its TypeScript validators, validation runner, install, release, versions, changelog-gen, release-notes, release-tag, gh, commitmsg, file tools and CLI entry are deleted, and `.` is the library. The Go tests that ran versions.ts and changelog-gen.ts compare with the outputs those wrote, recorded in pkg/ajan/codebasefx/testdata/release; the release contract test was already ported (TestReleaseContract). CHANGELOG Unreleased has the Migration entry for @eserstack/cli and the removed codebase exports.

Step 2c (2026-11-18): the TypeScript CLIs of ai (main, module, commands), cs (cli.ts), kit (main, mod, module, commands, and the add, list, clone and update handlers) and workflows (main, module, run, list) are deleted; each package root is its library. kit keeps the recipe library with the applier and new-project, which laroux init uses. cs keeps its TypeScript fallback in generate, a library behaviour rather than a CLI. The Go kit and cs parity tests compare with the trees and outputs the TypeScript CLIs wrote, recorded in cmd/eser/testdata. Unused dependencies dropped: ai logging, cs primitives, kit shell, workflows streams.
<!-- SECTION:NOTES:END -->
