---
id: TASK-73
title: >-
  Stop agents from enabling allowGit or replacing the git wrapper through file
  edits
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - noskills
  - security
dependencies: []
references:
  - pkg/@eserstack/noskills/commands/invoke-hook.ts
  - pkg/@eserstack/noskills/commands/git-wrapper.ts
priority: high
ordinal: 73000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The PreToolUse file guard in commands/invoke-hook.ts:443-445 lets every Write or Edit under .eser/ or .claude/ through. An agent can therefore set `allowGit: true` in .eser/manifest.yml or overwrite .eser/.state/bin/git, and both the text guard and the PATH git wrapper then allow git writes. This defeats the read-only git control that TASK-22 added. Rule: security-practices: Authorization in the Handler (deny by default).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Agent edits to the noskills section of .eser/manifest.yml and to .eser/.state/bin/ are denied, or allowGit lives where the agent cannot write
- [x] #2 Tests show an Edit that sets allowGit and a Write to the wrapper path are both denied
- [x] #3 Legitimate noskills writes under .eser/ still work
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

noskills: Verified checkProtectedFiles and decidePreToolUse: the protected-file check runs before the session and phase logic. Write, Edit and MultiEdit are covered, including through symlinks and `..`, and the noskills section is compared after parsing.

Verifier fix: bashProtectedFile now also refuses a non-read-only command that names a parent of the wrapper directory as a whole (`rm -rf .eser/.state`, `mv .eser x`, `cd .eser && rm -rf .state`, `find .eser -delete`). Before, such a command removed the wrapper without matching. Paths below those directories (`.eser/rules`, `.eser/.state/progresses/...`) still pass. Tests were added in hook-decisions.test.ts and the README paragraph was updated.
<!-- SECTION:NOTES:END -->
