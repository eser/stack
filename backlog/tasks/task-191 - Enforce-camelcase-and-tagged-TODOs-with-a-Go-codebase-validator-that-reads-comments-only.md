---
id: TASK-191
title: >-
  Enforce camelcase and tagged TODOs with a Go codebase validator that reads
  comments only
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 17:01'
labels:
  - go
  - codebase
  - validator
milestone: m-0
dependencies:
  - TASK-174
priority: medium
ordinal: 191000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
oxlint has no camelcase rule and no tag-requiring ban-untagged-todo rule. Add a codebasefx validator built on a small TS source lexer that separates comments, string literals, template literals and identifiers. M1-T10 reuses the lexer for the Deno and Bun identifier ban. The validator checks two things:
- Identifiers follow camelCase or PascalCase, apart from an allow list (for example SCREAMING_CASE constants and protocol keys).
- TODO and FIXME in comments carry the tag form from decision todo-tag-form, recommended TODO(TASK-<number>).
Text inside string and template literals is ignored, so the prompt strings in noskills/context/compiler.ts:826, :968, :2509 and :2783 pass. Today no source file carries a TODO(TASK-n) tag, and task-48 already replaced the TODO(TASK-NEW) placeholders, so the tree starts clean. Register the validator in registry.go, add the thin withGoValidator wrapper and a precommit step, and expose it as `codebase validate-naming-and-todos`.

Decisions this task waits on: decision-21 (Required TODO tag form and what the validator reads); decision-34 (Rules oxlint does not cover).

Plan key: M0-T16. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Go table tests cover passing and failing inputs for both checks, including TODO inside a string, a template literal and a comment
- [x] #2 The precommit workflow runs the validator, and it passes on the tree
- [x] #3 A fixture with an untagged TODO comment fails the gate
- [x] #4 `make ok` and `deno task cli ok` pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Go: codebasefx/ts_lexer.go (comments, quoted strings that end at their line when unterminated, template literals with nested ${} lexed as code, regex literals decided by the previous significant token, identifiers, numbers, punctuation; JSX text is lexed as code) and codebasefx/naming_todos.go: ValidateNamingAndTodos(allowNames) checks names declared after const/let/var/function(*)/class/interface/type (alias with = or <)/enum against camelCase, PascalCase, SCREAMING_SNAKE_CASE or underscore-only, skips keywords used as properties, and reports TODO/FIXME in comments without (TASK-<n>). Registered as codebase-naming-and-todos in registry.go and as naming-and-todos in the bridge (allowNames option via ParseAllowNames). TS: validate-naming-and-todos.ts (checkAll and the validator both call Go; it needs the native library), registered in validation/registry.ts (validator and workflow tools) and module.ts (eser codebase validate-naming-and-todos), precommit step in .eser/manifest.yml after validate-code-conventions, excluding .eser/recipes/. Not added to codebase package.json exports (publishing config needs the owner's approval). Tests: Go table tests (TODO in line/block comments, strings, templates, nested templates, substitutions, regexes with //, division, JSX quote, snake_case declarations, generator names, property and keyword-as-property cases, allow list); TS tests show an untagged TODO fixture fails validate(), run() reports a snake_case declaration with its line, allowNames passes. The tree has 0 findings. make ok and deno task cli ok passed. go mod tidy dropped the upstream jsonschema go.sum lines that the TASK-275 replace made unused.
<!-- SECTION:NOTES:END -->
