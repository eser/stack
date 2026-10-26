---
id: TASK-160
title: >-
  Find why the streams stdout sink stalls when synchronous FFI calls run between
  writes
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - streams
  - bug
dependencies: []
references:
  - pkg/@eserstack/streams/sinks/stdout.ts
  - pkg/@eserstack/workflows/run.ts
priority: medium
ordinal: 160000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A script that writes through streams.output with sinks.stdout(), calls codebase walkSourceFiles (a synchronous FFI call) three times, reads about 2000 files and then writes one more line never writes the last chunk and ends with 'Top-level await promise never resolved'. Without the FFI walk there is no stall. The sink (pkg/@eserstack/streams/sinks/stdout.ts:14-30) takes a writer and writes once per chunk. workflows/run.ts:42-58 now works around it with synchronous writes, so other CLI code still cannot use streams output next to FFI work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The root cause is identified and fixed in the sink or the output buffer
- [x] #2 A test reproduces the stall and passes after the fix
- [x] #3 The workflows workaround is removed or kept with a reason
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

small-a: Verified pkg/@eserstack/streams/output.ts. A single `draining` flag is set when a drain is scheduled and cleared in a finally, in the same synchronous step that finds the queue empty. flush() keeps a list of waiters, and the queue is cleared before onError runs. pkg/@eserstack/streams/sinks/process-stream.ts keeps one write chain per process stream, and the stdout and stderr sinks write through it. The regression tests in streams.test.ts and sinks/process-stream.test.ts pass. The workflows/run.ts LineWriter workaround is kept because that file belongs to another unit; the crossUnitNeeds entry says how to remove it.
<!-- SECTION:NOTES:END -->
