---
id: TASK-162
title: Feed non-Claude PreToolUse hooks the tool call they guard
status: Done
assignee: []
created_date: '2026-10-05 00:58'
updated_date: '2026-10-15 19:34'
labels:
  - noskills
  - security
dependencies: []
priority: medium
ordinal: 162000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The PreToolUse checks (git guard, protected files, phase gate) only see Claude Code-shaped input: tool_name Bash/Write/Edit/MultiEdit and tool_input on stdin. The generated OpenCode plugin (sync/adapters/opencode.ts) runs `invoke-hook pre-tool-use` through execSync with stdio "inherit" and passes no tool input, so the hook reads the terminal's stdin. Kiro registers the hook for tools named "write" and "shell", and Codex sends its own payload; invoke-hook.ts maps neither to the names it gates. For these tools the hook therefore allows everything. Fixing it means confirming each tool's hook payload and plugin API and mapping it in invoke-hook.ts or the generated config.

Decision: confirm each tool's hook payload and plugin API from its official documentation (cite the source in the code comment), map it in invoke-hook.ts, and make the generated OpenCode plugin pass the tool call on stdin. Where a tool's payload cannot be confirmed from documentation, the README states the gap.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The OpenCode plugin passes the tool name and input to `invoke-hook pre-tool-use` on stdin
- [x] #2 invoke-hook maps the OpenCode, Kiro, Codex and Copilot CLI tool names and input shapes to the shell and file-edit checks
- [x] #3 Tests feed each tool's payload shape to checkProtectedFiles and checkGitGuard and see a denial for a git write and an allowGit edit
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in round 3 of the autonomous backlog run (2026-10-05); deno task cli ok passes.

Verified:
- `toolCallOf`, `toolNameOf` and `toolInputOf` in hook-decisions.ts map the Codex, Copilot CLI (camelCase and PascalCase), Kiro and OpenCode tool names and inputs, with the doc sources cited in comments.
- The generated OpenCode plugin (sync/adapters/opencode.ts) spawns `invoke-hook pre-tool-use` with `{tool_name, tool_input}` on stdin and throws on exit code 2.
- invoke-hook.test.ts "each agent tool's PreToolUse payload" runs checkGitGuard, checkProtectedFiles and decidePreToolUse over every tool's payload, and each one refuses a git write and an allowGit edit.
- The README section "The PreToolUse hook in each tool" matches the code and states the gaps the docs leave.
<!-- SECTION:NOTES:END -->
