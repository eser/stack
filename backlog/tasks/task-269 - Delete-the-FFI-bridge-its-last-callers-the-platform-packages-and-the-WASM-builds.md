---
id: TASK-269
title: >-
  Move the codebase, workflows, kit, cs and posts library logic to Go behind the
  bridge and keep the WASM fallback under CI
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
labels:
  - cleanup
  - go
  - ci
  - docs
  - ffi
milestone: m-6
dependencies:
  - TASK-267
  - TASK-268
  - TASK-255
  - TASK-262
  - TASK-266
priority: medium
ordinal: 269000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decision go-ts-boundary, the bridge stays and Go owns the working parts. After M3-T12, M4-T7 and M5-T4 have deleted the TypeScript CLIs and twins, move the library logic that still exists only in TypeScript to its *fx package behind the M2-T7 dispatcher, one commit per package. Each package keeps its public API and types.
- codebase (codebasefx): the library modules that still have importers (git.ts, versions.ts, changelog-gen.ts, walk-stream.ts, validation/registry.ts and the validate-*.ts modules) delegate to codebasefx. TS-only validators left after M3-T5 and M3-T6 move to codebasefx, except those decision validator-home keeps in TypeScript.
- workflows (workflowfx): the library engine delegates to workflowfx, using the parity gaps closed in M3-T3 and the table in workflows/WIRING.md.
- kit (kitfx): what remains of the recipe processor, dependency, requires and variable resolvers, registry fetcher and tar handling delegates to kitfx.
- cs (csfx): generate and sync delegate to csfx.
- posts (postsfx): the domain and the bluesky, twitter and token-store adapters delegate to postsfx. The TUI menu, the CLI and the OAuth callback server stay in TypeScript as adapters, per decision posts-future.
- noskills: check that no TypeScript noskills module left after M5-T4 calls the bridge.
Write an audit table in each package's WIRING.md (created where missing) that marks every export as Go, moved or TS, with the reason for TS, and lists each kept fallback.

Keep the WASM fallback (decision-45): the loader tries node:ffi, then the wasi profile reactor, then reports a clear error and exits. Check that every name moved to Go in M6 is either served by the profile or returns UNSUPPORTED_IN_WASM there; workflowfx (expr, jsonschema, text/template), kitfx, postsfx without TASK-277 and csSync stay out of it. A CI job on every release builds the profile reactor, enforces TASK-272's size budget and dependency exclusion list, and runs a dispatcher call against it under `--no-experimental-ffi`. Add a CHANGELOG Migration entry that windows/arm64 and runs with node:ffi turned off use the WASM reactor, and list the names it serves.

Update AGENTS.md, .github/ARCHITECTURE.md, docs/agents and the skills to describe the final boundary: Go owns the business logic and the working parts, TypeScript libraries delegate through the bridge, the loader tries node:ffi, then the WASM build, then reports a clear error, and the repo keeps two Go modules (the root module and github.com/eser/ajan). List every removed TypeScript fallback in CHANGELOG Migration.

Decisions this task waits on: decision-22 (Where the Go and TypeScript boundary sits); decision-45 (ajan WASM fallback).

Plan key: M6-T3. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The WIRING.md of codebase, workflows, kit, cs and posts has the audit table, with every export marked Go, moved or TS and a reason on every TS row
- [ ] #2 Every function marked moved has a Go test in its *fx package and a TS test that reaches it through EserAjanCall, both run on the same fixture files
- [ ] #3 A CI job that runs on every release builds the wasi profile reactor, passes the size and dependency checks and, under `--no-experimental-ffi`, runs a dispatcher call against it, and a test checks that each name moved in M6 that the profile does not serve returns UNSUPPORTED_IN_WASM
- [ ] #4 `git grep -n -i -e 'pure typescript' -e 'pure TS' -e 'bridge is retired' -e 'retire the bridge' -e 'one go.mod' -- AGENTS.md .github/ARCHITECTURE.md docs/agents .agents/skills` returns nothing
- [ ] #5 go.mod and pkg/@eserstack/ajan/go.mod both exist, and `eser ok` passes, including lint and tests for both Go modules
- [ ] #6 CHANGELOG Unreleased, Migration lists every removed TypeScript fallback and which calls the WASM fallback serves
<!-- AC:END -->
