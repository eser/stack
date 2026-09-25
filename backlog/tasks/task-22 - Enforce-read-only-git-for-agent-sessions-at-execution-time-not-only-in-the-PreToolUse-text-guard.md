---
id: TASK-22
title: >-
  Enforce read-only git for agent sessions at execution time, not only in the
  PreToolUse text guard
status: To Do
assignee: []
created_date: '2026-09-25 01:12'
labels:
  - security
  - noskills
dependencies:
  - TASK-19
references:
  - pkg/@eserstack/noskills/commands/invoke-hook.ts
  - pkg/@eserstack/agents/guards/git.ts
  - security-report.md
priority: low
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-19 (security audit stack-run-1, fingerprint noskills/invoke-hook/git-guard-literal-substring-precheck). The PreToolUse hook classifies Bash command text. After TASK-19 it catches quoting, case, env-prefix, subshell, pipe, stdin-fed shell and readable-script forms, but it cannot decide a program an interpreter assembles at run time, for example python -c "subprocess.run(['g'+'it','push'])". A control that sees the actual exec is needed for that class. Options: a git wrapper placed first on PATH for agent sessions that refuses write subcommands unless allowGit is set; core.hooksPath pre-commit/pre-push hooks that refuse when NOSKILLS_SESSION is set; and documenting remote branch protection. The chosen control must not break the noskills run loop, which performs git commits itself.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An agent session cannot complete a git commit or push through an interpreter-built command such as python -c "subprocess.run(['g'+'it','push'])" while allowGit is false
- [ ] #2 The noskills run loop's own git commits still work
- [ ] #3 A regression test covers the interpreter case
- [ ] #4 deno task cli ok passes
<!-- AC:END -->
