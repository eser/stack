---
id: TASK-248
title: Make the Go eser the gate runner
status: In Progress
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-27 10:00'
labels:
  - go
  - gate
  - ci
  - docs
milestone: m-3
dependencies:
  - TASK-244
  - TASK-245
  - TASK-246
  - TASK-247
  - TASK-231
priority: high
ordinal: 248000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Register every codebasefx validator as `eser codebase <id> [--fix]` and as a workflowfx tool named as in .eser/manifest.yml. The precommit and preflight workflows run through cmd/eser, with oxfmt, oxlint, tsc and node --test as shell steps. `pnpm ok`, `pnpm fix` and `pnpm preflight` call `go run ./cmd/eser`. `eser codebase install` writes git hooks that call the Go eser. The CI validate job runs it. Update the AGENTS.md Essential Commands and docs/agents/workflow.md in the same change.

Decisions this task waits on: decision-20 (The documented command form for the gate and scripts); decision-24 (When the gate runner moves to Go).

Plan key: M3-T7. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `eser ok` and `make ok` pass locally and in CI validate
- [x] #2 The precommit and commit-msg hooks run the Go binary
- [x] #3 Every validator id in the manifest resolves to a Go tool; the docs name `eser ok`
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-27. cmd/eser: `eser workflows run|list` (workflows.go) runs .eser/manifest.yml on workflowfx with the flags of the TypeScript run (-e, -w, --fix, --dry-run, --only, --config, -v, --json, --changed, positional args as _args), prints each step with ProgressPrinter, writes fixes and exits 1 on a failed step; the manifest's ok, fix and preflight scripts therefore run on Go as `eser ok|fix|preflight`. `eser codebase <validate-*> [--fix] [--dry-run] [--root] [--exclude] [--no-manifest]` (codebase_validators.go) runs one validator with its manifest step's options. `eser codebase install|uninstall|status` (codebase_hooks.go) writes pre-commit, commit-msg (`-- "$1"`) and pre-push hooks into `git rev-parse --git-path hooks`, running `go run ./cmd/eser` in eser/stack and `eser` elsewhere (--command overrides), with the TypeScript marker so either install updates the other's hooks; tested against temp dirs and a temp git repo only.
validatortools: the validate-* names were aliases of the codebase-* tools, which walk every extension, read binaries and keep Go-only semantics, so the Go gate failed the tree with 10,236 issues. manifest_parity.go registers them as TS-parity tools: per-tool extensions (json/jsonc, toml, yml/yaml, JS for licenses), the TS DEFAULT_EXCLUDES, a NUL-in-8-KiB binary skip, any-CR line endings, the TS merge-marker patterns, every YAML document parsed (allowMultipleDocuments honored), root .gitmodules only, no built-in filename excludes (ValidateFilenames now treats an empty, non-nil list as none), and a failing step when server-loc's directory or error-coverage's file is missing. --fix: new codebasefx fixers (FixEOF, FixTrailingWhitespace, FixBOM, FixLineEndings, FixLicenseHeader) produce mutations; a fixed file is re-validated, so a fix run that removes every issue passes. _changedFiles is honored.
workflowfx: --only matched the tool name only (engine.go step loop), so a shell step could not be selected and an empty selection passed; it now matches the tool or the step's name, and RunByEvent/RunWorkflowWithConfig return ErrNoStepSelected naming the filter (only_filter_test.go; TASK-363 has the Go half, the TS engine is unchanged).
Root package.json: ok, fix, preflight scripts call `go run ./cmd/eser`. build.yml: Validate runs `pnpm ok`, Release Preflight `pnpm preflight`; actionlint clean. Docs: AGENTS.md Essential Commands and Absolute Rules, docs/agents/workflow.md, release-and-ci.md, languages-and-security.md, architecture-and-code.md, .github/ARCHITECTURE.md, CONTRIBUTING.md, cmd/eser/README.md.
Comparison on a clone of HEAD plus this change (the shared checkout was broken by in-flight TASK-233/TASK-238 edits): `pnpm cli ok` and `pnpm ok` ran the same 33 steps in the same order, all passed; `pnpm fix` changed no file; `pnpm preflight` passed its 12 steps; `make ok` passed. Left: AC #1 needs a CI Validate run; AC #2 needs the hooks of this checkout reinstalled with `go run ./cmd/eser codebase install` (the integration agent's step).
The integration agent ran `go run ./cmd/eser codebase install` on main after the Go gate passed; pre-commit, commit-msg and pre-push now call `go run ./cmd/eser workflows run`. AC #2 holds; AC #1 waits for the CI Validate run.
<!-- SECTION:NOTES:END -->
