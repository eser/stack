---
id: TASK-31
title: 'Low-severity hardening: RSC CORS header, forwarded CLI args, PowerShell unzip'
status: Done
assignee: []
created_date: '2026-09-25 21:29'
updated_date: '2026-10-04 20:52'
labels:
  - security
dependencies: []
references:
  - pkg/@eserstack/laroux-server/adapters/react/rsc-handler.ts
  - pkg/@eserstack/cli/scripts.ts
  - pkg/@eserstack/codebase/cli-system/handlers/update.ts
priority: low
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Three small findings from the rules audit. (1) pkg/@eserstack/laroux-server/adapters/react/rsc-handler.ts:123-125 sends Access-Control-Allow-Origin: * on same-origin /rsc responses. (2) pkg/@eserstack/cli/scripts.ts:153 joins forwarded args unquoted into sh -c. (3) pkg/@eserstack/codebase/cli-system/handlers/update.ts:284 builds a PowerShell command string from interpolated paths, which also mangles backslashes. Rule: security-practices: No Injection Through Strings, http-and-auth.md: Security Headers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 /rsc responses carry no wildcard CORS header, or the reason is documented
- [x] #2 Forwarded script args are shell-quoted, with a test for spaces and quotes
- [x] #3 Windows update extraction passes paths as arguments, not interpolated into a command string
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Applied in the skills sweep on 2026-10-04; deno task cli ok passes.

codebase: Only item 3 belongs to this unit. extractArchiveCommand returns an argument array: Windows uses %SystemRoot%\System32\tar.exe with tar.exe from PATH as the fallback, Unix uses tar -xzf. updateCompiledBinary runs it through shellExec.CommandBuilder, and no PowerShell string remains. Table tests with hostile Windows paths and an end-to-end tar run into a directory with shell metacharacters pass. Items 1 and 2 belong to the laroux-server and cli units.

laroux-server: Item 1 is done and checked. streamToResponse sends no Access-Control-* headers, the JSDoc says why, and rsc-handler.test.ts asserts the headers are absent. No other Access-Control header remains in the laroux-server sources; only the gitignored dist/ build output still has one. Items 2 and 3 belong to other units. AC #4 is checked by the orchestrator.

cli: Only item #2 belongs to this unit, and I verified it is done. buildShellArgs passes forwarded args as sh positional parameters expanded by a quoted "$@" and trims the command's trailing whitespace, so an argument from a block-scalar command cannot run as a command. scripts.test.ts covers spaces, both quote kinds, backslash, $, *, an empty arg, a newline, ;, $(), backticks, && and |, and all of it passes. Items #1 and #3 belong to the laroux-server and codebase units, and the orchestrator checks #4.
<!-- SECTION:NOTES:END -->
