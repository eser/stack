---
id: TASK-200
title: Define the precommit and preflight workflows on the new toolchain
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
labels:
  - cutover
  - gate
  - manifest
milestone: m-1
dependencies:
  - TASK-199
priority: high
ordinal: 200000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rewrite .eser/manifest.yml.
Precommit:
- Delete gen-jsr-manifests and deno-publish-check.
- build-native-lib calls make.
- validate-package-configs checks package.json only, or is deleted (per decision jsr-publishing).
- The deno-formatter, deno-linter and deno-type-check steps become oxfmt --check (fix: oxfmt), oxlint (fix: --fix) and tsc --noEmit.
- deno-tests becomes `node --test` over pkg/**/*.test.ts and etc/scripts/*.test.ts, with spec output plus an LCOV reporter to etc/coverage.lcov and a per-file timeout. Never use --test-force-exit.
Preflight:
- Delete compile-current per the binaries decision.
- The npm-build, consumer-install, ajan-build, homebrew-dry-run and nix-dry-run steps run under node or make.
Scripts:
- test, test-watch, lint, fmt, check, build, bench and coverage become their node equivalents.
- Fix clean, which currently deletes pnpm-lock.yaml.
- Delete docs (deno doc --html) and container-build; repl is already gone (M0-T9).
- docs-lint points at the Go validate-docs.

Decisions this task waits on: decision-5 (Keep publishing to JSR or move the libraries to npm only); decision-20 (The documented command form for the gate and scripts); decision-33 (Type checker and emitter); decision-43 (Replacement for deno doc --html and --lint).

Plan key: M1-T6. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `grep -n deno .eser/manifest.yml` returns nothing outside validator excludes that M1-T37 removes
- [ ] #2 `pnpm cli ok` runs every precommit step on Node (red results allowed until M1-T37)
- [ ] #3 `pnpm cli preflight` runs every remaining preflight step on Node
- [ ] #4 Coverage lands at etc/coverage.lcov
<!-- AC:END -->
