---
id: TASK-170
title: Make the eser self-invocation in manifest scripts work outside deno run
status: Done
assignee: []
created_date: '2026-10-05 00:58'
updated_date: '2026-10-15 19:34'
labels:
  - cli
  - bug
dependencies: []
priority: medium
ordinal: 170000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
resolveCliPrefix always builds `<execPath> run --allow-all <dir>/main.ts`, which is correct only under `deno run`. In the compiled binary (Homebrew, install.sh), execPath is the eser binary itself, so a script starting with `eser` runs `eser run --allow-all <embedded path>/main.ts ...` and lands in the fallback as an unknown `run` subcommand. In the npm bundle under Node or Bun, it runs `node run --allow-all <dist>/chunks/main.ts`, and pkg/@eserstack/cli/dist/chunks/scripts-*.js contains that prefix. I found this by reading the code and the dist bundle, not by running the compiled binary. It is left out of this run because the fix picks an invocation for each install mode (cross-runtime detectInvoker already tells them apart), and checking it needs the compiled binary and the npm bundle built and run. Those builds are release preflight steps that stage 1 does not run. It also goes beyond TASK-100, which covers quoting only.

Decision: pick the invocation from cross-runtime detectInvoker: the compiled binary calls itself directly; the npm bundle runs its own entry file with the current runtime; `deno run` keeps the current prefix. Verify the compiled binary with a local `deno compile` build and the npm bundle with a local npm build; neither is published.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A compiled binary runs a manifest script `eser version --bare` and prints the version
- [x] #2 The npm bundle under Node runs the same script
- [x] #3 The prefix keeps every path as a single-quoted word
- [x] #4 Tests cover the prefix for each invoker
- [x] #5 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in round 3 of the autonomous backlog run (2026-10-05); deno task cli ok passes.

Verified independently. The prefix comes from cross-runtime detectInvoker, as the unit decided: the binary runs itself, npm/npx/pnpm/pnpx/bun/bunx run argv[1] with the current runtime, deno/dev keep `run --allow-all main.ts`, and unknown or a missing entry file falls back to `eser` on PATH. The CLI checks Deno.build.standalone itself because cross-runtime reports a deno-compiled binary as a Deno install (the crossUnitNeeds entry stands). detectCliInvoker reads Deno.build.standalone, so no unit test covers it; I checked it with a real compiled binary instead. The README recipe replacement (cool-lime-app to laroux-runtime-app) is in place.
<!-- SECTION:NOTES:END -->
