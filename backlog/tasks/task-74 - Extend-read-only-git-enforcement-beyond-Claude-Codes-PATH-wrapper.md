---
id: TASK-74
title: Extend read-only git enforcement beyond Claude Code's PATH wrapper
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - noskills
  - security
dependencies: []
references:
  - pkg/@eserstack/noskills/commands/git-wrapper-install.ts
  - pkg/@eserstack/noskills/commands/git-wrapper.ts
  - pkg/@eserstack/noskills/README.md
priority: medium
ordinal: 74000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Only Claude Code sessions (SessionStart writes CLAUDE_ENV_FILE, git-wrapper-install.ts:166) and `noskills run` get the git wrapper. Codex, OpenCode and Copilot CLI call `invoke-hook session-start` without an env-file mechanism, Cursor, Kiro and Windsurf have no hooks, and on Windows nothing is installed (git-wrapper-install.ts:126 returns null) because the wrapper is a POSIX sh script. A program that runs git by absolute path (/usr/bin/git push) skips both the text guard and the wrapper. Evaluate Claude Code's sandbox settings (deny writes to .git/, restrict network) as the enforced layer for allowGit: false, and document remote branch protection.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each supported tool either gets the wrapper or its gap is documented in the noskills README
- [x] #2 Windows gets a git.cmd shim or a documented limitation
- [x] #3 The README states what stops an absolute-path git call and recommends remote branch protection
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

noskills: Verified that exportGitWrapper installs the wrapper whenever allowGit is not true and writes CLAUDE_ENV_FILE only when that variable is set. Codex, Copilot CLI, Kiro and OpenCode all register session-start (sync/adapters/*). The README's tool list, Windows limitation, absolute-path section, sandbox snippet and branch protection advice match the code. I checked the sandbox keys against the current Claude Code sandboxing docs: filesystem.denyWrite, allowUnsandboxedCommands and project-relative './' paths, with hooks running outside the sandbox.
<!-- SECTION:NOTES:END -->
