---
id: TASK-143
title: >-
  Stop processfx.Process.Wait from panicking when the context ends without a
  signal
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - processfx
  - bug
dependencies: []
references:
  - pkg/ajan/processfx/process.go
priority: high
ordinal: 143000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
processfx.New (pkg/ajan/processfx/process.go:48-67) starts a goroutine that blocks on sigChan and then logs sig.String(). Wait (lines 119-131) calls signal.Stop and close(p.Signal), so after a cancel that was not an OS signal the goroutine receives a nil os.Signal and calls String on it, which crashes the process whenever a logger is set (confirmed with a probe). New also registers signal.Notify in the constructor, so tests that never call Wait leave the handler registered and the goroutine blocked. Rule: coding-practices: Owned Asynchronous Work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The goroutine exits on ctx.Done() or a closed channel without dereferencing nil
- [x] #2 Wait after a non-signal cancel does not panic, covered by a test with a non-nil logger
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

go-libs: Checked /Users/eser/projects/eser/stack/pkg/ajan/processfx/process.go. watchSignals selects on ctx.Done() and on the signal channel, and checks ok on the receive. It logs with fmt.Sprint(sig), so a nil signal cannot crash it, and signal.Stop is deferred so it runs on every return. Wait now blocks on the unexported signalWatcherDone channel instead of closing Signal. Removing the handler before Shutdown is the same order as before, because the old Wait also called signal.Stop before Shutdown. Tests: TestProcess_WaitEndsTheSignalWatcher (cancel, base context ending, simulated signal; Wait called twice; real logger) and TestWatchSignalsReturnsOnClosedChannel, both passing 5 runs under -race. The callers in appcontext and noskills-server build unchanged, and the README matches the code.
<!-- SECTION:NOTES:END -->
