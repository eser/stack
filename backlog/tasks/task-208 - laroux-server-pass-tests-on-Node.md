---
id: TASK-208
title: 'laroux-server: pass tests on Node'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 18:00'
labels:
  - cutover
  - laroux-server
milestone: m-1
dependencies:
  - TASK-198
priority: high
ordinal: 208000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port the hand-edit tests to node:fs: path-containment.test.ts and the server-modules tests use Deno.mkdir, makeTempDir and symlink. Run scripts/npm-build.ts under node. Update the README.

Keep it mechanical: track L replaces runtime/server.ts's request ladder (TASK-308, TASK-317). Tests for files that track L deletes (doc-3 section 27) get the tag `track-l-delete` in their test name, so TASK-317 can find them.

Plan key: M1-T14. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `node --test 'pkg/@eserstack/laroux-server/**/*.test.ts'` passes
- [x] #2 `git grep -wn Deno pkg/@eserstack/laroux-server` returns nothing; tsc and oxlint are clean
- [x] #3 runtime/html-shell.ts uses the owner's description, and git grep -n 'Deno 2' -- 'pkg/@eserstack/laroux*' .eser/recipes returns nothing
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner decision 2026-10-16: the default SEO description in runtime/html-shell.ts becomes "Zero-configuration React framework built on Server Components. Modern, simple, and built with cutting-edge technology." Also fix .eser/recipes/laroux-app/public/llms.txt (runtime line: Node.js instead of Deno 2.x).

Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: 20 files, 17 pass, 3 fail (1 killed at 180 s); 131 tests pass, 6 fail.
- Deno API in tests: runtime/path-containment.test.ts:70-172 Deno.makeTempDir, mkdir, writeTextFile, remove (2 tests); domain/server-modules.test.ts:189 Deno.symlink (1).
- Assertion semantics: domain/server-modules.test.ts:126 expects TypeError for a module that does not parse, and Node throws SyntaxError; runtime/server.test.ts:109 "POST /_rsc refuses a body over the limit" builds `new Request` with a stream body, which needs `duplex: "half"` on Node.
- Other: runtime/server.test.ts:537-565, the HMR WebSocket test, fails with "no open" (the undici handshake fails against the node-http upgrade); needs investigation. Open handle: after its 14 tests server.test.ts never exits ("Promise resolution is still pending"); skipping "two peers ... separate rate-limit buckets" makes it exit, so that test leaves a rate-limiter timer or server open.
- Source: Deno. 0; jsr: 1 and npm: 1 (scripts/npm-build.ts:119 externals); import.meta.main 4 needs no change.
- Docs: pkg/@eserstack/laroux-server/README.md (3), deno.extra.json (1).

TASK-198 (2026-10-25): the test and bench codemods left no site for hand edits in this task's files (0 unhandled). After them, these test files still fail under `node --test --test-force-exit` on Node 26.12.1, each run alone:
- pkg/@eserstack/laroux-server/domain/server-modules.test.ts: 2 failing, 3 passing; first error: SyntaxError".
- pkg/@eserstack/laroux-server/runtime/path-containment.test.ts: 2 failing, 2 passing; first error: TypeError: bundler.getBundle is not a function
- pkg/@eserstack/laroux-server/runtime/server.test.ts: 2 failing, 11 passing; first error: Error: no open

TASK-208 (2026-10-25, node 26.12.1):
- `node --test` on the package, with and without `--test-force-exit`: 137 tests, 137 pass, 0 fail, and the run exits on its own. tsc reports nothing under laroux-server; oxlint is clean.
- Tests: path-containment.test.ts uses runtime.fs; server-modules.test.ts links node_modules with the node:fs/promises symlink (junction) and expects SyntaxError for a module that does not parse; server.test.ts passes `duplex: "half"` for the stream body, and its "not a server action" fixture writes its marker with node:fs instead of Deno.writeTextFileSync, which on Node threw before writing and so could not fail the test.
- runtime/server.ts: the Node adapter recognizes the WebSocket handshake response by identity, and the handler copied it through withSecurityHeaders because it checked an `upgrade` header the Node response lacks; the handler now returns that response object unchanged. createHandler takes an optional signal that stops the rate limiter's cleanup interval, and startHTTPServer passes its signal, so a stopped server no longer keeps the process alive.
- oxlint react(no-children-prop): render-app.ts, ssr-renderer.ts and rsc-flight-renderer.test.ts pass children as the third createElement argument.
- runtime/html-shell.ts carries the owner's description; README, comments and scripts/npm-build.ts no longer name Deno. `node scripts/npm-build.ts` builds dist/ and `node dist/laroux.js --help` runs; the `npm:*` and `jsr:*` externals are gone.
- Tagged `track-l-delete:` (54 tests): adapters/react, domain/action-registry, domain/build-module, domain/html-shell and runtime/html-shell tests, runtime/server.test.ts, and the three createHandler tests in path-containment.test.ts, per TASK-317's delete list.
- Open for AC #3: .eser/recipes/laroux-app/public/llms.txt still says "Deno 2.x" (lines 3 and 9) and is outside this package. .eser/manifest.yml (npm-build-laroux) still runs scripts/npm-build.ts with deno run.
The integration agent changed the two Deno 2.x lines in .eser/recipes/laroux-app/public/llms.txt to Node.js, so AC #3 holds.
<!-- SECTION:NOTES:END -->
