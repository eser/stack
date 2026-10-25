---
id: TASK-208
title: 'laroux-server: pass tests on Node'
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 19:38'
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
- [ ] #1 `node --test 'pkg/@eserstack/laroux-server/**/*.test.ts'` passes
- [ ] #2 `git grep -wn Deno pkg/@eserstack/laroux-server` returns nothing; tsc and oxlint are clean
- [ ] #3 runtime/html-shell.ts uses the owner's description, and git grep -n 'Deno 2' -- 'pkg/@eserstack/laroux*' .eser/recipes returns nothing
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
<!-- SECTION:NOTES:END -->
