---
id: TASK-114
title: Document the shell package's public API and decide its root re-exports
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - shell
  - docs
dependencies: []
references:
  - pkg/@eserstack/shell/mod.ts
  - pkg/@eserstack/shell/module.ts
  - pkg/@eserstack/shell/README.md
priority: low
ordinal: 114000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
deno doc --lint on pkg/@eserstack/shell/mod.ts reports 27 errors: missing JSDoc on tui/symbols.ts constants, box.ts, layout.ts, list.ts, vterm/terminal.ts (VTerminal and its members), module.ts, go-exec.ts types and the mod.ts namespace re-exports, plus private-type-ref in module.ts (ModuleEntry, GroupOptions, Command). env, vterm and go-exec are reachable only by sub-path, so the README shows `import * as shellEnv from "@eserstack/shell/env"`; env depends only on cross-runtime and could become `export * as env`, while vterm and go-exec pull in heavy dependencies. Rules: documentation-conventions: Docs Change With the Code, README Import Pattern.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 deno doc --lint on the shell entry points reports no errors
- [x] #2 The root re-export decision is recorded and the README matches it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

shell: Doc lint across the 11 shell entry points went from 1 remaining error to 0. That error was CliResult -> primitives Result. I added `// deno-doc-ignore private-type-ref -- Result is public in @eserstack/primitives/results; doc lint flags it only because the workspace resolves it to a local file` in args/types.ts. Re-exporting Result was ruled out because it pulls in primitives' undocumented Ok and Fail. The TuiContext -> streams Output error stage 1 reported had already been cleared by the documented TuiOutput alias in tui/types.ts. Root re-export decision: env, vterm and goExec are namespaces on the root, and the sub-paths stay published. It is recorded in the mod.ts module JSDoc and the README introduction, and the README examples use shell.env, shell.vterm and shell.goExec. The README and JSDoc examples type-check with deno check --doc and --doc-only.
<!-- SECTION:NOTES:END -->
