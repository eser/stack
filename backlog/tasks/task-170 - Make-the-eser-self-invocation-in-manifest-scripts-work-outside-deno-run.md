---
id: TASK-170
title: Make the eser self-invocation in manifest scripts work outside deno run
status: To Do
assignee: []
created_date: '2026-10-05 00:58'
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
- [ ] #1 A compiled binary runs a manifest script `eser version --bare` and prints the version
- [ ] #2 The npm bundle under Node runs the same script
- [ ] #3 The prefix keeps every path as a single-quoted word
- [ ] #4 Tests cover the prefix for each invoker
- [ ] #5 deno task cli ok passes
<!-- AC:END -->
