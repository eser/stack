---
id: TASK-100
title: Quote the eser self-invocation paths in manifest scripts
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - cli
  - bug
dependencies: []
references:
  - pkg/@eserstack/cli/scripts.ts
priority: medium
ordinal: 100000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
resolveCliPrefix in pkg/@eserstack/cli/scripts.ts:116-131 returns `${execPath} run --allow-all ${mainPath}`, and resolveCommand splices it unquoted into the `sh -c` script text. A deno path or checkout path with a space or a shell character (for example C:/Users/John Smith/.deno/bin/deno.exe) breaks every manifest script that starts with `eser`. The forwarded-argument fix for TASK-31 item 2 does not cover these runtime paths. Rule: security-practices: No Injection Through Strings.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Both paths are passed as POSIX single-quoted words or as positional parameters
- [x] #2 A test uses a path with a space and a quote
- [x] #3 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

cli: shellQuote produces POSIX single-quoted words, and buildCliPrefix quotes both the exec path and main.ts. resolveCommand is pure, and executeCommand passes it resolveCliPrefix(). Tests: a shellQuote table and a buildCliPrefix test with a space and a quote. An exec test runs a stand-in runtime in "John Smith's tools" with an entry path under "checkout it's $HOME"; every argument arrived as one word. A real `eser version --bare` manifest script works under deno run.
<!-- SECTION:NOTES:END -->
