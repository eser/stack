---
id: TASK-314
title: 'codebase: laroux package-boundary and workerd-graph validators'
status: Done
assignee: []
created_date: '2026-10-24 01:30'
updated_date: '2026-11-07 20:00'
labels:
  - codebase
  - go
  - validators
  - track-l
milestone: m-7
dependencies:
  - TASK-246
  - TASK-247
  - TASK-241
priority: medium
ordinal: 314000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-46's validator, as a Go codebasefx validator on the M0-T16 lexer (decision-32), run in precommit:
- laroux-server/runtime/ never imports cli/ or dev/
- bundler never imports react or a laroux package
- @eserstack/laroux never imports @eserstack/bundler or laroux-server
- nothing imports @tanstack/*
- no new code imports laroux-bundler or laroux-react once they are deprecated (an allowlist holds today's importers and only shrinks)
The workerd-graph check (no server graph reaches node:ffi or an ajan binding outside the wasi profile, decision-45 as amended on 2026-10-24) runs at build time in laroux-server (TASK-312, TASK-318) because it needs the bundle graph; this task adds a fixture test for it to the conformance suite.

Plan key: L6a. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Fixture tests fail for each forbidden import and pass for the allowed ones
- [x] #2 The validator runs in precommit through .eser/manifest.yml, and the gate passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-07. New Go validator `validate-laroux-boundaries`: pkg/ajan/codebasefx/ts_imports.go reads module specifiers from the tokens of the M0-T16 lexer (import and export-from declarations, type-only ones too, side-effect and dynamic imports, import types, require, import.meta.resolve; a template specifier counts up to its first ${), and pkg/ajan/codebasefx/laroux_boundaries.go applies the rules in CheckLarouxBoundaries. Relative imports are resolved to the package they land in, so a `../../laroux/...` path counts like the package name. Tests and recipes are in scope. Registered as a tree tool in validatortools/manifest_tools.go, on the bridge as codebaseCheckLarouxBoundaries (the wasi profile goes from 44 to 45 names and the native registry from 85 to 86, with their tests and the ajan README updated; the profile is 7,590,966 bytes raw and 1,474,480 brotli, under the limits), and in TypeScript as validate-laroux-boundaries.ts, validation/validators/laroux-boundaries.ts, the registry and module.ts, so `pnpm cli ok` finds the step too. It runs through .eser/manifest.yml after build-native-lib.

Rules checked against main before writing them: none of the first four has a violation today. laroux-server/runtime/ imports nothing from cli.ts or commands/; bundler imports neither React nor a laroux package and its package.json declares neither; laroux imports neither bundler nor laroux-server (config/defaults.ts names laroux-server in a string list, which is no import); @tanstack appears in no source file, package.json or the lockfile. Those fixtures prove the rules; no allowlist entry hides a violation of them.

Choices the task left open. laroux-server has no cli/ or dev/ directory yet, so the first rule also covers cli.ts and commands/, where that code lives today, including the `/cli` and `/commands/*` export sub-paths. `react` means react and react-* packages. `laroux`, the npm name of laroux-bin (decision-47), counts as a laroux package and as the tool. A package's own imports are outside the last rule.

Allowlist: .eser/baselines/laroux-deprecated-importers.json, per package, generated from the validator's own findings on this tree and compared with a grep for the package names: 14 importers of laroux-bundler and 13 of laroux-react. Ten of the laroux-react entries and all the laroux-bundler ones are in laroux-server; the other three are laroux-bundler tests that call import.meta.resolve on laroux-react. A stale entry fails, whether its file dropped the import, only mentions the package in a comment, or is gone. A missing allowlist file counts as empty, and a key other than the two packages is an error. The list only shrinks: TestLarouxImporterAllowlist_OnlyShrinks fails on an entry that pkg/ajan/codebasefx/testdata/laroux_deprecated_importers_snapshot.json lacks. The rule is in force now, ahead of the packages' formal deprecation.

Limits. Only direct imports with a literal specifier count. rsc-client-entry.ts in laroux-bundler reaches laroux-react through the constant BOOTSTRAP_EXPORT, which the check cannot read, so that file is not on the allowlist. package.json is not read: .eser/recipes/laroux-app/package.json and .eser/recipes.json still declare @eserstack/laroux-react, though the recipe's source does not import it. runtime/server.ts (type-only) and runtime/hmr.test.ts import domain/hmr-manager.ts, which is dev code by purpose but sits in domain/, so the first rule will see it only if it moves to dev/.

Deferred: the workerd-graph fixture test named in the description is not written. The check it would exercise runs at build time in laroux-server (TASK-312, TASK-318) and the conformance suite it belongs to is TASK-315; neither exists yet, and a test of nothing would prove nothing. TASK-315's notes carry this. It is not one of this task's acceptance criteria.

Verified: Go fixtures in laroux_boundaries_test.go (each forbidden import fails and each allowed one passes for every rule, every import form, text that is no import, the allowlist and stale cases), manifest_parity_test.go, the bridge test in bridge_codebase_options_test.go and validate-laroux-boundaries.test.ts. On the real tree, temporary probe files with a forbidden import per rule and two stale entries were reported by both `go run ./cmd/eser codebase validate-laroux-boundaries` and `pnpm cli codebase validate-laroux-boundaries`, then removed. `pnpm ok` passes with the step in it.
<!-- SECTION:NOTES:END -->
