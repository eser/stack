---
id: TASK-242
title: Add a CLI support package with prompt primitives to pkg/ajan
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 19:22'
labels:
  - go
  - ajan
  - cli
  - tui
milestone: m-3
dependencies:
  - TASK-174
priority: high
ordinal: 242000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decision go-cli-deps, add pkg/ajan/clifx. It provides command trees with aliases, flags on the standard library, help, exit codes, JSON output and generated shell completions. It also provides prompt primitives (confirm, select, multiselect, text) with injected stdin, stdout and clock, built on lipgloss and the one vetted prompt dependency. cmd/eser and cmd/noskills build on it. This is Go-only work and can start during M1.

Decisions this task waits on: decision-26 (Go dependencies for the CLI framework and prompts).

Plan key: M3-T1. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Table-driven tests cover parsing, help output, completions and every prompt through a fake terminal
- [x] #2 No global state; golangci-lint and `make ok` pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24. New package pkg/ajan/clifx (README, listed in docs/agents/documentation-and-tooling.md). Commands: a Command tree with Name, Aliases, Short, Long, Args, Flags (a func that defines flags on a fresh flag.FlagSet per run), Run, Subcommands and Hidden; App{Name, Version, Root, Stdin, Stdout, Stderr}.Run(ctx, args) returns the exit code: ExitOK 0 (success, help, --version), ExitFailure 1 (Run error), ExitUsage 2 (unknown command or flag, Usagef from Run), or an *ExitError's code. Every command takes --json (Context.Output writes indented JSON, or calls the human writer) and --help; help comes from --help, 'help <path>' or a group without Run, with lipgloss v2 bold headings that lipgloss.Fprint drops for non-color writers. Completions: 'completion bash|zsh|fish' prints a script that calls back the hidden '__complete <words...>', which prints matching subcommands and aliases, or flags for a '-' word; hidden commands stay out. Prompts: Prompter{In, Out, Env, Clock, Accessible} with Confirm, Select, MultiSelect and Text (options passed by pointer), on charm.land/huh/v2 v2.0.3, the one prompt dependency decision-26 allows (vetting recorded in decision-26). Accessible mode is huh's line mode, fed one line per Read so several prompts can share one input; output goes through colorprofile so non-terminals get no escape codes; Timeout uses the injected Clock (SystemClock by default) and returns ErrPromptTimeout; Ctrl+C returns ErrPromptAborted. No package-level mutable state (only the immutable heading style). Tests: TestRunParsing (13 cases: defaults, alias, -name=, --json, nested alias, --, Usagef, unknown flag and subcommand, failing Run, exit code, hidden, --version), TestHelpOutput (4 exact help texts), TestCompletions (6 candidate cases, the three scripts, an unknown shell), and every prompt case (confirm yes/no/default, select, select with default, multiselect, multiselect with defaults, text, text with a validator) both in line mode and in the terminal UI driven by key sequences over a pipe (a fake terminal), plus several prompts on one input, a timeout on a fake clock, Ctrl+C, and a select with no options; the suite passed three runs with -race. cmd/eser and cmd/noskills do not exist yet; they build on clifx in M3 and M4. golangci-lint 0 issues; make ok and deno task cli ok passed.
<!-- SECTION:NOTES:END -->
