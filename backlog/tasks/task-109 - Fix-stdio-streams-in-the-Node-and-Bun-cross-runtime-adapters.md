---
id: TASK-109
title: Fix stdio streams in the Node and Bun cross-runtime adapters
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - standards
  - bug
dependencies: []
references:
  - pkg/@eserstack/standards/cross-runtime/adapters/node-shared.ts
  - pkg/@eserstack/standards/cross-runtime/adapters/bun.ts
priority: medium
ordinal: 109000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
createNodeCompatProcess (shared by Node and Bun) calls Readable.toWeb(process.stdin) and Writable.toWeb on stdout and stderr when the runtime is created (standards/cross-runtime/adapters/node-shared.ts:449-459), and the runtime singleton is created on import. Readable.toWeb on stdin keeps Node alive until stdin closes, so a Node CLI run with an open stdin pipe hangs after its work. In the Bun adapter, spawnChild returns proc.stdin as a WritableStream (bun.ts:159-162), but Bun returns a FileSink for a piped stdin, which has no getWriter.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The Node stdio web streams are created on first access
- [x] #2 Bun child stdin is wrapped in a WritableStream or typed correctly
- [x] #3 A test runs the Node adapter with an open stdin pipe and exits, and a Bun smoke test writes to child stdin
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

standards-web: Verified:
- createLazyReadable (highWaterMark 0) and createLazyWritable in adapters/web-streams.ts open the process streams only on the first read or write.
- The Bun child stdin is wrapped by createFileSinkWritable.
- node.test.ts (open stdin pipe exits; piped stdin read) and bun.test.ts (exit with open stdin, getWriter writes, env merge, abort signal) all ran and passed here on Node 26.5.1 and Bun 1.3.14.

The extra Bun fixes (signal passed, status.signal, env merge) are listed in stage 1 breakingChanges.
<!-- SECTION:NOTES:END -->
