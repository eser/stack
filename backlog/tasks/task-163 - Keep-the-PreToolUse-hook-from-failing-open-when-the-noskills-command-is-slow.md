---
id: TASK-163
title: Keep the PreToolUse hook from failing open when the noskills command is slow
status: Done
assignee: []
created_date: '2026-10-05 00:58'
updated_date: '2026-10-15 19:34'
labels:
  - noskills
  - security
dependencies: []
priority: medium
ordinal: 163000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
sync/hooks.ts gives the Claude Code PreToolUse hook a 5 second timeout and other adapters set similar ones. When the hook does not answer in time (for example `npx eser@latest noskills` waiting on the npm registry), the tool call goes ahead, so the git guard and the protected-file check fail open. Options: recommend or detect an installed noskills command at init, raise the timeout, or warn at session start when the command goes through npx.

Decision: raise the PreToolUse hook timeout in the generated configs to 30 seconds, matching the git wrapper's check; make init and sync warn when the configured noskills command runs through npx, npm exec or a remote `deno run` specifier and recommend an installed command; and state the remaining limit in the README.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A slow or unreachable noskills command no longer makes the PreToolUse guard allow git writes silently, or the README states the limit and the fix
- [x] #2 Init or sync warns when the hook command depends on the network
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in round 3 of the autonomous backlog run (2026-10-05); deno task cli ok passes.

Verified:
- HOOK_TIMEOUT_SECONDS['pre-tool-use'] equals GIT_CHECK_TIMEOUT_SECONDS (30), and the Claude Code, Codex, Copilot CLI, Kiro and OpenCode configs all use it.
- networkRunnerOf and networkCommandWarning detect npx, pnpx, bunx, npm exec/x, pnpm dlx, yarn dlx and remote `deno run`/`deno x` modules; init shows the warning.
- The README paragraph "When the hook is slow" states the limit and the fix.
- The OpenCode plugin refuses the call when the check cannot answer.
<!-- SECTION:NOTES:END -->
