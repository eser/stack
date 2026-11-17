# @eserstack/codebase: Agent Guide

This package is a TypeScript library: the git, package config and workspace
discovery helpers, and the generated types of the codebase native functions.
The repository-wide rules are in the root `AGENTS.md` and `.agents/skills/`.

---

## Check and Fix Tools Are Go

Scope: Validators, git hooks, release, changelog and the other
`eser codebase` commands

Rule: Write them in Go, in `pkg/ajan/codebasefx` with the command in
`cmd/eser`; this package has no command and no validator. A check returns
issues and a fix returns the new content, neither writes to disk, and the
workflow runner decides whether to apply a fix.

**Why:** the gate runs on the Go eser (TASK-248), and the TypeScript twins were
deleted once every command ran in Go (TASK-255).

---

## Adding a Validator

Scope: A new `validate-*` tool

Rule:

1. Write the check, and the fix when it has one, in `pkg/ajan/codebasefx`, with
   a table-driven test.
2. Add it to the manifest tools of `pkg/ajan/codebasefx/validatortools`
   (`manifest_parity.go` for the file tools, `manifest_tools.go` for the
   workspace ones), so a manifest step and `eser codebase <name>` find it.
3. Add it to the `precommit` steps in `.eser/manifest.yml`, with a comment on
   why it exists.
4. When the rule has existing violations, record them in a baseline under
   `.eser/baselines/` and fail only above it, as `validate-code-conventions`
   does (`code_conventions_baseline.go`), instead of excluding files. A rule
   that allows no exception, such as `validate-runtime-js-apis`, has no
   baseline.
