# Spec: adapt-eser-codebase-module-to-use-the-new-eser-she

## Status: done

## Concerns: long-lived, beautiful-product, open-source

## Discovery Answers

### status_quo

Validators run and dump results after a blank terminal wait. No spinner/progress
feedback during 40+ validator runs. CI gets ANSI escape codes in logs.
Scaffolding already uses TUI but validation (the most-used path) does not.

### ambition

8/10. Progress bar advancing per-validator with streaming results. Interactive
error drill-down via select prompt. Confirm prompts for --fix mode (with --yes
flag for CI). --json structured output flag. Parallel validator execution
(bounded concurrency 8-12) in read-only mode. Consistent TUI patterns across all
workflows (validation, scaffolding, release, changelog, git). Clean plain text
in non-interactive/CI. Opportunistic performance wins.

### reversibility

Low risk. Validators return pure ToolIssue[] data — we only change the rendering
layer. Direct coupling to TuiContext (no adapter wrapper). Can revert without
touching business logic.

### user_impact

None. No existing users scripting against output. Freedom to redesign output
format. --fix adding confirm prompts is new behavior, mitigated by --yes flag
and auto-skip in non-interactive mode.

### verification

Manual CI verification — run deno task cli ok in GitHub Actions and confirm
output has no ANSI escape codes and reads cleanly. No snapshot tests or golden
files.

### scope_boundary

IN: Validation TUI (progress+streaming+drill-down), --fix confirm prompts +
--yes flag, non-interactive plain text, --json output, parallel validators
(read-only, sequential in --fix), consistent TUI across all workflows,
opportunistic perf wins. OUT: TuiContext redesign, exotic terminal hardening
(Windows/SSH edge cases), createFileTool() contract changes, structured JSON as
default output. ARCHITECTURAL DECISIONS: (1) TuiContext created in
cli-support.ts via extended createCliOutput(), (2) --json suppresses all TUI —
clean stdout only, (3) Bounded parallel execution 8-12 concurrency. ERROR
HANDLING: Promise.allSettled for parallel, fallback to non-interactive on TTY
misdetection, --yes auto-accepts in CI, exit codes preserved (0=pass, 1=fail).

## Design States (empty, loading, error, success) (beautiful-product)

_To be addressed during execution._

## Mobile Layout (beautiful-product)

_To be addressed during execution._

## Interaction Design (beautiful-product)

_To be addressed during execution._

## Contributor Guide (open-source)

_To be addressed during execution._

## Public API Surface (open-source)

_To be addressed during execution._

## Out of Scope

- IN: Validation TUI (progress+streaming+drill-down), --fix confirm prompts +
  --yes flag, non-interactive plain text, --json output, parallel validators
  (read-only, sequential in --fix), consistent TUI across all workflows,
  opportunistic perf wins
- OUT: TuiContext redesign, exotic terminal hardening (Windows/SSH edge cases),
  createFileTool() contract changes, structured JSON as default output
- ARCHITECTURAL DECISIONS: (1) TuiContext created in cli-support.ts via extended
  createCliOutput(), (2) --json suppresses all TUI — clean stdout only, (3)
  Bounded parallel execution 8-12 concurrency
- ERROR HANDLING: Promise.allSettled for parallel, fallback to non-interactive
  on TTY misdetection, --yes auto-accepts in CI, exit codes preserved (0=pass,
  1=fail).

## Tasks

- [x] task-1: 8/10. Progress bar advancing per-validator with streaming results.
      Interactive error drill-down via select prompt. Confi...
- [x] task-2: Manual CI verification — run deno task cli ok in GitHub Actions
      and confirm output has no ANSI escape codes and reads cleanly
- [x] task-3: No snapshot tests or golden files.

## Verification

- Manual CI verification — run deno task cli ok in GitHub Actions and confirm
  output has no ANSI escape codes and reads cleanly
- No snapshot tests or golden files.
