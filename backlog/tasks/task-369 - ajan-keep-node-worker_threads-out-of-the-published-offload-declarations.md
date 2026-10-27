---
id: TASK-369
title: 'ajan: keep node:worker_threads out of the published offload declarations'
status: Done
assignee: []
created_date: '2026-10-27 13:00'
labels:
  - ajan
  - npm
  - bug
dependencies: []
priority: high
ordinal: 372000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while preparing TASK-237 and TASK-368: the release preflight's library-consumer step (TASK-236) fails on main at tsc with `@eserstack/ajan/dist/ffi/offload.d.ts(24,32): error TS2591: Cannot find name 'node:worker_threads'`. The step type-checks every packed library in a consumer project without @types/node. The worker pool from TASK-239 and the consumer check from TASK-236 landed from parallel branches, so neither branch saw the failure.

Root cause: pkg/@eserstack/ajan/ffi/offload.ts typed the exported `OffloadOptions.spawn` test seam, and the private `spawnWorker` and `startLane`, with `workerThreads.Worker`, so tsc kept `import * as workerThreads from "node:worker_threads"` in the emitted declarations.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The emitted offload.d.ts does not import node:worker_threads
- [x] #2 The library-consumer preflight step passes with every packed library
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
offload.ts declares `PoolWorker`, the Worker members the pool uses (postMessage, on for message, error and exit, ref, unref, terminate), and types `spawn`, `spawnWorker` and `startLane` with it. A `node:worker_threads` Worker still satisfies it, so callers and the tests are unchanged. The implementation keeps its runtime import; only the declarations lose it.

Verified: `pnpm -r build`, `pnpm -r pack`, then `node ./etc/scripts/preflight-library-consumer.ts` reports 38 libraries installed from their tarballs and the declarations type-check. No CHANGELOG entry: nothing is published yet, and users change nothing.
<!-- SECTION:NOTES:END -->
