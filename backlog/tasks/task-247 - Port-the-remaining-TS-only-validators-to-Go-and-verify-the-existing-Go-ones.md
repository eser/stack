---
id: TASK-247
title: Port the remaining TS-only validators to Go and verify the existing Go ones
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 19:54'
labels:
  - go
  - codebasefx
  - validators
milestone: m-3
dependencies:
  - TASK-174
priority: high
ordinal: 247000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port validate-self-imports, validate-error-coverage and validate-server-loc to codebasefx. Check that the Go circular-deps, export-names, mod-exports and commit-msg validators produce the same findings as their TS wrappers, and close any gaps.

Decisions this task waits on: decision-32 (Home of the validators that inspect TypeScript source).

Plan key: M3-T6. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each Go validator matches the TS output on the current tree and on fixtures
- [x] #2 `make ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24. New pkg/ajan/codebasefx/ts_ported_validators.go: ValidateSelfImports (the TS line regex, comment-line skip and message verbatim), CheckErrorCoverage and ValidateErrorCoverage (Name: &Type{...} entries, required fields as line-start Field: "..." with a non-empty value; '<name>: missing [<fields>]'), CheckServerLoc and ValidateServerLoc (lines counted as content.split('\\n').length; '<n> lines (limit <max>)'), with ParseErrorCoverageOptions and ParseServerLocOptions (ErrMissingOption for the required file or directory, ErrInvalidOption for wrong types). Registered as codebase-self-imports, codebase-error-coverage and codebase-server-loc in validatortools, and as self-imports, error-coverage and server-loc in the bridge's codebaseValidateFiles (an option-requiring validator that is requested without its option fails the request). Parity: the new TS test pkg/@eserstack/codebase/go-validator-parity.test.ts runs TS and Go side by side: self-imports on a fixture (6 findings: import, subpath, export-from, side-effect and dynamic imports, a multi-line import's closing line; comments, other packages and @eserstack/foobar pass) and on the repository; error-coverage on a fixture with three option sets and on pkg/ajan/noskillsserverfx/errors.go with the manifest's settings; server-loc on a fixture (two limits) and on pkg/ajan/noskillsserverfx; all equal. circular-deps, export-names and mod-exports needed no port: their TS wrappers call the Go validators through the bridge, so the findings are the same by construction. Gap closed in commit-msg: the Go ValidateCommitMsg differed from the TS rules in every respect that the parity table hit: it validated the whole trimmed message (so a message with a body failed, since '.+$' cannot cross a newline), did not pass merge commits, used another default type list (adding style and build), read allowAsterisk as 'the message "*" passes' instead of the wildcard scope fix(*), and with options left out (zero-value bools) rejected multiple scopes and the wildcard, which the TS defaults allow; the messages differed too. Go now implements the TS rules and messages exactly, DefaultCommitMsgOptions gives the TS defaults, and the bridge request takes *bool options so a left-out option keeps the default. The TS rules are exported as validateCommitMsgLocal (validateCommitMsg falls back to it), and the parity test compares it with the Go rules on 13 messages times 4 option sets. The baseline writer of TASK-246 (WriteCodeConventionsBaseline, FormatCodeConventionsBaseline) moved to code_conventions_baseline.go with //go:build !wasip1: its x/text/collate tables had pushed the WASM profile to 8,029,882 bytes, over the 8,000,000 limit; the profile is now 7,816,793 bytes raw, 1,509,390 brotli. Go unit tests: ts_ported_validators_test.go, the commit-msg table rewritten for the TS semantics, and the registry tests. make ok and deno task cli ok passed.
<!-- SECTION:NOTES:END -->
