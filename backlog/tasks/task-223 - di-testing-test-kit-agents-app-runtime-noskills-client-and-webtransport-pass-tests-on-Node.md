---
id: TASK-223
title: >-
  di, testing, test-kit, agents, app-runtime, noskills-client and webtransport:
  pass tests on Node
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 18:00'
labels:
  - cutover
  - di
  - testing
  - test-kit
  - tests
milestone: m-1
dependencies:
  - TASK-198
priority: medium
ordinal: 223000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seven small packages, one commit each. Fix the hand edits from the notes: the 31 di spies and the agents tests. In test-kit, add ./leaks, an opt-in leak check that diffs process.getActiveResourcesInfo() in afterEach. It is Node-only, which is why it waits for the cutover. Give it JSDoc and a test, and confirm that test-kit's own tests run under node --test.

Decisions this task waits on: decision-3 (Where the assertion and mock seam lives).

Plan key: M1-T29. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `node --test` passes for each package
- [x] #2 test-kit ./leaks reports a deliberately leaked timer in a fixture test
- [x] #3 No Deno reference remains in them; tsc and oxlint are clean for each
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: 18 files, 16 pass, 2 fail: di 3 of 4 (40 pass, 1 fail), testing 2 of 3 (23 pass, 1 fail), test-kit 3/3 (8), agents 3/3 (21), app-runtime 1/1 (10), noskills-client 3/3 (90), webtransport 1/1 (18).
- di: fluent-api-factory.test.ts:68 "di.invoke(): lambda" fails with "j is not a function": type stripping keeps the source text, so fn.toString() is `j => j()` where Deno's transpiler printed `(j)=>j()`, and invoker.ts:6-25 looks for the first "(", so it reads no parameters from a paren-less arrow. A source fix.
- testing: temp-dir.test.ts:30 fails on the standards Node makeTempDir empty-prefix bug (TASK-201).
- test-kit: `./leaks` does not exist yet; its own tests run under node --test.
- Sanitizer options to remove: webtransport 1.
- Source: 0 Deno, Bun or specifier uses in all seven packages. Docs: pkg/@eserstack/di/README.md (1).

TASK-198 (2026-10-25): the test and bench codemods left no site for hand edits in this task's files (0 unhandled). After them, these test files still fail under `node --test --test-force-exit` on Node 26.12.1, each run alone:
- pkg/@eserstack/testing/temp-dir.test.ts: 1 failing, 5 passing; first error: AssertionError: Expected actual: "<tmp> to contain: "<tmp>

TASK-223 work (2026-10-25, node 26.12.1, each package run with `node --test --test-force-exit`):
- di: invoker.ts reads the parameter of a paren-less arrow (`j => j()`, `async j => j()`). The oxfmt reformat had turned the "di.invoke(): lambda" fixture into `(j) => j()`, which hid the bug; it is restored under oxfmt-ignore and two invoker tests cover both forms. 43 of 43 pass. README no longer names Deno.
- testing: 23 of 24 pass. temp-dir.test.ts:30 still fails on the standards Node adapter: node-shared.ts makeTempDir calls `mkdtemp(path.join(dir, prefix))`, and with the default empty prefix that creates a sibling of the temp dir (`<tmp>XXXXXX`). The fix belongs to TASK-201: pass `path.join(dir, prefix)` plus a trailing separator when the prefix is empty.
- test-kit: new `./leaks` export (leaks.ts, JSDoc, README section). `checkLeaks()` registers beforeEach and afterEach hooks that diff `process.getActiveResourcesInfo()` and fail the test with "the test leaked active resources: Timeout (+1)". leaks.test.ts runs testdata/leaked-timer.ts in a child `node --test` and checks the leaking test fails and the clean one passes. 12 of 12 pass. No existing export changed.
- agents: 21 of 21 pass; the git-bypass benign sample "deno task test" became "pnpm test".
- app-runtime: 10 of 10 pass; explicit types on `default` and the three void methods for isolatedDeclarations (4 tsc errors before).
- noskills-client 90 of 90 and webtransport 18 of 18 pass with no changes; no sanitizer options remain.
- The di spies and agents tests needed no hand edits after TASK-198.
- tsc: 0 errors in the seven packages; oxlint and oxfmt --check clean on them.
TASK-201 fixed makeTempDir without a prefix in standards (node-shared.ts), so testing/temp-dir.test.ts now passes: testing 24 of 24, and AC #1 holds for all seven packages.
<!-- SECTION:NOTES:END -->
