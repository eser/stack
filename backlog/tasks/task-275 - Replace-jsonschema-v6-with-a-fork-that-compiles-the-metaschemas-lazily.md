---
id: TASK-275
title: Replace jsonschema/v6 with a fork that compiles the metaschemas lazily
status: Done
assignee: []
created_date: '2026-10-24 00:20'
updated_date: '2026-10-24 16:49'
labels:
  - go
  - dependencies
  - performance
  - docs
milestone: m-0
dependencies: []
priority: medium
ordinal: 275000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decision-56, github.com/santhosh-tekuri/jsonschema/v6 v6.0.3 compiles five metaschemas in draft.go's init(), which costs 1.3 ms of every native bridge load and 5.3 ms of a WASM init. Carry a fork, with no upstream PR.

- Copy v6.0.3 into `third-party/jsonschema/` at the repo root, with its go.mod, its Apache-2.0 LICENSE and its file headers unchanged.
- Patch draft.go so each draft's metaschema compiles on first use behind a sync.Once (or sync.OnceValue), and keep the change as small as possible, so a later upstream version can be rebased onto it.
- Add `replace github.com/santhosh-tekuri/jsonschema/v6 => ./third-party/jsonschema` to go.mod and `=> ../../../third-party/jsonschema` to pkg/@eserstack/ajan/go.mod.
- Leave the note where agents look:
  - `third-party/jsonschema/FORK.md`: the upstream version and commit, what the patch changes and why, how to rebase onto a new upstream version, and that govulncheck does not cover the copy, so upstream advisories are checked by hand on each bump
  - a comment above each `replace` line that points to FORK.md and decision-56
  - an entry in docs/agents/languages-and-security.md, in the Go modules section
- Exclude third-party/ from the repo's license-header, file-name and code-convention validators and from golangci-lint, and record the exclusion in docs/agents/documentation-and-tooling.md.

Plan key: M0-T25. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Both go.mod files replace jsonschema/v6 with ./third-party/jsonschema, each with a comment naming FORK.md and decision-56
- [x] #2 FORK.md exists with the upstream version, the patch summary, the rebase steps and the advisory note, and docs/agents/languages-and-security.md mentions the fork
- [x] #3 A Go test with GODEBUG=inittrace=1 or a benchmark shows the jsonschema init under 0.1 ms, and workflowfx validation tests pass unchanged
- [x] #4 `deno task cli ok` passes, with the validators and golangci-lint skipping third-party/
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Copied v6.0.3 (commit b0fc661f4939578bc429f408c18202573dbafcc4) to third-party/jsonschema without .github, go.work, go.work.sum and .pre-commit-hooks.yaml. Patch: draft.go init() body moved unchanged into loadMetaschemas = sync.OnceFunc(...); compiler.go NewCompiler() calls it, then newCompiler() (the old body), and the loader compiles with newCompiler() so it never re-enters. The fork's own go test ./... passes. Measured with GODEBUG=inittrace=1 on a program that links only the package: upstream 5.9 ms clock, 1.7 MB, 21667 allocs; fork 0.042 ms, 9.6 KB, 161 allocs. pkg/ajan/workflowfx/workflowfx_jsonschema_init_test.go builds testdata/inittrace and fails above 0.1 ms; workflowfx tests pass unchanged. replace lines with comments in both go.mod files. FORK.md covers version, patch, rebase steps and the govulncheck note; docs/agents/languages-and-security.md has the Go modules entry; docs/agents/documentation-and-tooling.md records the exclusions. third-party/ is excluded from validate-filenames, validate-licenses, validate-eof, -trailing-whitespace, -bom, -line-endings, the root deno.json (fmt and lint) and .golangci.yaml (linters and formatters); validate-code-conventions reads only JS/TS files. Full gate: deno task cli ok passed on 2026-10-24.
<!-- SECTION:NOTES:END -->
