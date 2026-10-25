---
id: TASK-201
title: 'standards: make cross-runtime Node-only and synchronous'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-25 18:00'
labels:
  - cutover
  - standards
  - cross-runtime
  - deno-removal
milestone: m-1
dependencies:
  - TASK-198
priority: high
ordinal: 201000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Changes in standards:
- Delete adapters/deno.ts, deno.test.ts and the ./cross-runtime/deno export. Delete the Bun adapter, its tests and the ./cross-runtime/bun export.
- Delete the Deno and Bun branches in adapters/shared.ts (:39-40, :211, :226, :287-288, :323-324) and in execution-context.ts: the deno and bun invokers, and the jsr:/https: mainModule detection at :126, :212-249 and :395.
- Import the Node adapter statically so mod.ts:256 has no top-level await. Keep the browser entry that laroux maps for client bundles.
- Add process.isStandalone through node:sea isSea(), and fs.statSync (or drop the fsSync capability).
Hand edits from the notes: adapter tests spawn node, node-http.test.ts uses node:net instead of Deno.connect, and mod.test.ts uses process.versions.node instead of Deno.version. Port the collection benches to mitata. Update the README and record the two removed subpath exports for M1-T36.

Decisions this task waits on: decision-15 (Keep Bun support); decision-16 (Keep the @eserstack/standards runtime facade).

Plan key: M1-T7. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `node --test 'pkg/@eserstack/standards/**/*.test.ts'` passes
- [x] #2 From inside pkg/@eserstack/testing, which declares @eserstack/standards, `node -e "require('@eserstack/standards/cross-runtime')"` succeeds without ERR_REQUIRE_ASYNC_MODULE
- [x] #3 tsc reports no errors and oxlint is clean for files under pkg/@eserstack/standards
- [x] #4 `git grep -wn 'Deno\|Bun' pkg/@eserstack/standards` returns nothing, and the README lists only the remaining adapters
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Hand-work list (TASK-175 spike, 2026-10-24, node 26.12.1, macOS arm64; throwaway codemod Deno.test -> node:test, t.step -> t.test, Deno.bench -> skipped placeholders, ignore -> skip, sanitize options dropped, @std/testing/bdd -> node:test; one node --test process per file):
- node --test: 21 files, 15 pass, 6 fail; 513 tests pass, 18 fail; adapters/node-http.test.ts was killed at 180 s.
- Deno API at runtime in tests: adapters/node-http.test.ts:121 uses Deno.connect for the raw unmasked frame, and the failure skips the server close, so the file hangs (with that test skipped it exits 0 in 1 s): use node:net and try/finally. adapters/node.test.ts:169 and bun.test.ts:159 skip on `Deno.build.os === "windows"`. adapters/deno.test.ts:15 has a top-level Deno.build (the file goes away with the adapter). mod.test.ts:19 reads Deno.version.deno.
- Tests that assume a Deno host: mod.test.ts (6 tests: detectRuntime, isRuntime twice, the current singleton, createRuntime, the http override); execution-context.test.ts "should detect Deno runtime"; execution-context.test.ts:1245 "should find deno in PATH" passes only when deno is on PATH and fails on a Node-only runner.
- Bun: bun.test.ts fails 7 of 7 with a bun shim and is skipped without bun; it goes away with the adapter.
- Adapter differences found through other packages (fix here): adapters/node.ts:83 `proc.on("error", reject)` makes an aborted runtime.exec.spawn reject with "The operation was aborted" where the Deno adapter resolves (breaks noskills commands/next.test.ts:1699); adapters/node-shared.ts:196 makeTempDir() with no prefix calls mkdtemp(join(tmpdir, "")) and creates a sibling of the tmpdir (breaks testing/temp-dir.test.ts:30).
- Non-test source: Deno. 73 (adapters/deno.ts 64, shared.ts 9); Bun. 14 (bun.ts 9, web-streams.ts 1, shared.ts 1); jsr: 2 and npm: 1, all in execution-context.ts (:153, :215, :295); import.meta.main 0.
- Benches: 3 files, 120 placeholders (registry 36, immutable-map 49, indexed 35); mitata is in no package.json and there is no bench script.
- Docs: pkg/@eserstack/standards/README.md (16 mentions). No Go twin.

TASK-198 (2026-10-25): the test and bench codemods left no site for hand edits in this task's files (0 unhandled). After them, these test files still fail under `node --test --test-force-exit` on Node 26.12.1, each run alone:
- pkg/@eserstack/standards/cross-runtime/adapters/bun.test.ts: 1 failing, 6 passing; first error: see the run
- pkg/@eserstack/standards/cross-runtime/adapters/deno.test.ts: 1 failing, 0 passing; first error: ReferenceError: Deno is not defined
- pkg/@eserstack/standards/cross-runtime/adapters/node-http.test.ts: 1 failing, 7 passing; first error: see the run
- pkg/@eserstack/standards/cross-runtime/adapters/node.test.ts: 1 failing, 6 passing; first error: see the run
- pkg/@eserstack/standards/cross-runtime/execution-context.test.ts: 1 failing, 125 passing; first error: AssertionError: Values are not equal.
- pkg/@eserstack/standards/cross-runtime/mod.test.ts: 7 failing, 29 passing; first error: AssertionError: Values are not equal.

2026-10-25 (TASK-201 implementation):
- Deleted adapters/deno.ts, deno.test.ts, bun.ts, bun.test.ts and the ./cross-runtime/deno and ./cross-runtime/bun exports. RuntimeName is "node" | "workerd" | "browser" | "unknown". shared.ts lost the Deno and Bun branches, mapStdioToDeno, getDenoStdioOptions and DenoStdioMode; web-streams.ts lost the Bun-only createFileSinkWritable and FileSinkLike.
- mod.ts imports the node, workerd and browser adapters statically and builds `runtime` synchronously, so require() loads it (no ERR_REQUIRE_ASYNC_MODULE). createRuntime keeps its Promise signature. The ./cross-runtime/browser entry is unchanged.
- New API: runtime.process.isStandalone (node:sea isSea(); false in the stubs) and runtime.fs.statSync (throws NotFoundError; the stub fs throws RuntimeCapabilityError). fsSync stays and documents statSync.
- execution-context.ts: CliRuntime is "node" | "compiled"; CliInvoker is "binary" | "npm" | "npx" | "pnpm" | "pnpx" | "dev" | "unknown". The deno and bun invokers and the jsr:/https: mainModule detection are gone; detectInvoker dropped its mainModule parameter (now execBasename, runtimeName, argv, envVars, isDevContext?). The dev context is ported to Node: a file:// module plus a "cli" script in the cwd's package.json gives dev/dev, checked before the npx/pnpx heuristics, so `pnpm cli` yields devCommand. detectExecutionContext treats a single executable application as a binary. CliCommandOptions.jsrPackage is optional and unused.
- Fixes, failing tests first in adapters/node.test.ts: an aborted spawn and spawnChild resolve with the failed result (the AbortError no longer rejects); makeTempDir() with no prefix creates the directory inside the temp dir instead of a sibling.
- Tests: probes and node.test.ts spawn process.execPath; node-http.test.ts uses node:net; mod.test.ts checks process.versions.node and adds a require() load test; execution-context tests are Node-only. isolatedDeclarations errors fixed in format-percent.ts, logging.ts, patterns.ts, server-websocket.ts, probes.ts. The benches were already on mitata (TASK-198) and run.
- Verified: node --test over the package 507 pass, 0 fail; AC #2 prints the runtime; tsc reports no error under pkg/@eserstack/standards; oxlint and oxfmt --check clean; `git grep -wn 'Deno\|Bun'` is empty.
- For M1-T36 (TASK-230): removed subpath exports @eserstack/standards/cross-runtime/deno and /bun; RuntimeName lost "deno" and "bun"; CliInvoker lost "deno", "bun", "bunx"; CliRuntime lost "deno", "bun"; detectInvoker lost its mainModule parameter; RuntimeFs gained statSync and RuntimeProcess gained isStandalone.
<!-- SECTION:NOTES:END -->
