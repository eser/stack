---
id: TASK-214
title: 'posts: pass tests on Node and move its deno tasks to package.json'
status: To Do
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 19:38'
labels:
  - cutover
  - posts
milestone: m-1
dependencies:
  - TASK-198
  - TASK-202
priority: medium
ordinal: 214000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port the remaining test hand edits:
- callback-server.test.ts: Deno.listen, connect and networkInterfaces become node:net and node:os.
- auth-provider.test.ts:98, :102: Deno.inspect becomes util.inspect.
- config.test.ts: Deno.chdir becomes process.chdir, which is safe with per-file process isolation.
- file-token-store.test.ts.
Move the three deno.extra.json tasks into package.json scripts that run on node, through the integration agent, then delete the file.

Plan key: M1-T20. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `node --test pkg/@eserstack/posts` passes
- [ ] #2 pkg/@eserstack/posts/deno.extra.json is deleted
- [ ] #3 No Deno reference remains; tsc and oxlint are clean
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1):
- node --test: 28 files, 23 pass, 5 fail; 299 tests pass, 8 fail.
- Deno API in tests: adapters/tui/callback-server.test.ts:8-9,103,109 Deno.listen, NetAddr, networkInterfaces, connect (3 tests); config.test.ts:190-204,285-312 Deno.makeTempDir, cwd, chdir, writeTextFile, remove (2); adapters/twitter/auth-provider.test.ts:98,102 Deno.inspect (1); adapters/token-store/file-token-store.test.ts:15-43 a Deno.build.os skip condition fails the whole file at load, plus Deno.stat, makeTempDir, chmod, readDir, remove.
- Deno-style spawn: adapters/cli/output.test.ts:24 `new Deno.Command(Deno.execPath())` (1).
- Source: Deno. 0; import.meta.main 1 (adapters/tui/app.ts) needs no change. Move the 3 deno.extra.json tasks (4 Deno mentions) to package.json scripts.
- Docs: pkg/@eserstack/posts/README.md (1). pkg/ajan/postsfx is clean.
<!-- SECTION:NOTES:END -->
