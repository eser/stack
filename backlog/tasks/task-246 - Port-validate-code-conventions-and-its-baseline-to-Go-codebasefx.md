---
id: TASK-246
title: Port validate-code-conventions and its baseline to Go codebasefx
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 19:32'
labels:
  - go
  - codebasefx
  - validators
milestone: m-3
dependencies:
  - TASK-174
  - TASK-191
priority: high
ordinal: 246000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port pkg/@eserstack/codebase/validate-code-conventions.ts (namespace imports, no literal || defaults and the rest) to codebasefx, reusing the M0-T16 lexer. It reads and writes .eser/baselines/code-conventions.json in the same format, including --write-baseline. Go-only work.

Decisions this task waits on: decision-32 (Home of the validators that inspect TypeScript source).

Plan key: M3-T5. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 On the current tree the Go validator reports exactly what the TS one reports
- [x] #2 --write-baseline produces a byte-identical baseline file; `make ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24. pkg/ajan/codebasefx/code_conventions.go ports validate-code-conventions.ts: FindCodeConventionViolations (namespace-import, or-default, export-star, with the TS regexes and messages verbatim), ValidateCodeConventions(root, baseline) (fails a file only above its baseline count, with the '[N in this file, baseline allows M]' suffix; skips .eser/recipes/, etc/temp/ and the TS walker's DEFAULT_EXCLUDES), ReadCodeConventionsBaseline (missing file = empty, broken JSON names --write-baseline), WriteCodeConventionsBaseline(ctx, root, path) and FormatCodeConventionsBaseline (rules in fixed order, paths in localeCompare order through golang.org/x/text/collate root collation, JSON.stringify spacing, final newline). Registered as codebase-code-conventions in validatortools (option baseline, default .eser/baselines/code-conventions.json). The code mask reuses the M0-T16 lexer (tsToken gained a Start offset). Parity: a one-off run over the whole tree compared the TS findViolations output (path, rule, line, message) with the Go one; the first run differed on one line, pkg/@eserstack/agents/guards/git.ts:523 (Go reported '|| new RegExp'). Root cause: the TS source-mask.ts had no notion of regex literals, so the quote in /["'\\]/g at git.ts:274 and a later backtick desynced it and masked real code until line 524, hiding the violation (a TS false negative). Fixed at the origin: source-mask.ts codeMask now tells a regex from a division by the previous significant token, as the Go lexer does (failing tests first in source-mask.test.ts: a regex holding quotes and a backtick, division after values, a regex after a keyword with a class holding a slash); validate-runtime-js-apis uses the same mask and its tests pass. The newly visible git.ts:523 was an OR of two regex tests, not a default: the two regexes became the named constants PIPE_INTO_SHELL and SHELL_HEREDOC (one cross-package edit in @eserstack/agents, its tests pass). After that the TS and Go violation lists are identical (6 violations), and the TS --write-baseline and Go WriteCodeConventionsBaseline outputs are byte-identical; the committed baseline was shrunk with the documented TS --write-baseline command (it dropped the stale pkg/@eserstack/fp/wthout.bench.ts entry, a file that no longer exists). Tests: code_conventions_test.go (21 rule cases, exact messages, baseline counts and ignored paths, the file format with locale-ordered paths, read-back, missing and broken baselines, and the repo baseline byte-equal to the committed file); the registry test lists the new tool. make ok and deno task cli ok passed.
<!-- SECTION:NOTES:END -->
