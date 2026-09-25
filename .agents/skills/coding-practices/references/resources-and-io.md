# Resources and I/O

Timeouts, limits, cleanup, streaming, background work and performance claims, in
TypeScript and Go. Go specifics: go-practices context, data-structures and
performance references.

## Contents

- External Calls Have Timeouts
- Bound Every Resource
- Release Resources Where They Are Acquired
- Stream Large Data
- Owned Asynchronous Work
- Performance Claims Need Measurement

---

## External Calls Have Timeouts

Scope: Every network request, subprocess and other call that leaves the process,
in TypeScript and Go

Rule: Every external call has a timeout, so one slow dependency cannot hang the
caller. Retry only operations that are safe to repeat (reads, idempotent
writes), with exponential backoff and a maximum number of attempts, and never
retry a validation or authorization failure. Between attempts, check whether the
caller has cancelled (Go `ctx.Err()`, TypeScript `signal.aborted`) and wait with
a timer that cancellation interrupts, so a retry loop never outlives its caller.
A caller that makes many calls to the same dependency bounds its concurrency.

Correct:

```typescript
import * as shellExec from "@eserstack/shell/exec";

const response = await fetch(url, {
  signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
});
await shellExec.exec`git fetch origin`.timeout(60_000).text();
```

```go
client := httpclient.NewClient(httpclient.WithConfig(cfg)) // pkg/ajan/httpclient: timeouts and retries from config
```

Incorrect:

```typescript
const response = await fetch(url); // waits forever on a stalled server
```

**Why:** without a bound, the slowest dependency sets the latency of everything
that calls it, and a stuck call holds its connection and memory indefinitely.

---

## Bound Every Resource

Scope: Pools, queues, buffers, caches, concurrency, request and file sizes, in
TypeScript and Go

Rule: Everything that can grow has a limit: connection and worker pools, queue
and channel depths, in-memory caches, concurrent goroutines or promises, and the
size of what is read from a request, a file or a subprocess. Pick the limit on
purpose, make it a setting with a safe default when callers may need another
value, and decide what happens at the limit: wait, reject with an error, or drop
the oldest entry.

Correct:

```go
jobs := make(chan Job, 100) // producers block when 100 jobs are waiting
g.SetLimit(4)               // at most 4 concurrent syncs
body := http.MaxBytesReader(w, r.Body, 1<<20)
```

Incorrect:

```go
for _, p := range projects {
    go sync(p) // one goroutine per project, however many there are
}
```

**Why:** an unbounded resource grows until the process runs out of memory or
file handles, usually under the load where it matters most.

---

## Release Resources Where They Are Acquired

Scope: Files, sockets, locks, timers, subprocesses, in TypeScript and Go

Rule: Release a resource in the same scope that acquired it, set up right after
the acquisition succeeds: `defer` in Go, `try`/`finally` or `await using` in
TypeScript. A failure to close a writer can mean lost data, so report it.

Correct:

```typescript
const lock = await acquireLock(lockPath);
try {
  return await updateState(state);
} finally {
  await lock.release();
}
```

Incorrect:

```typescript
const lock = await acquireLock(lockPath);
const result = await updateState(state); // a throw here keeps the lock forever
await lock.release();
```

**Why:** cleanup at the end of a function is skipped by the first early return
or thrown error someone adds later.

---

## Stream Large Data

Scope: Reading, transforming or transferring data whose size is not small and
fixed, in TypeScript and Go

Rule: Process large or unbounded data as a stream: rows one at a time, files and
responses through streams, results through lazy iterators. Load all at once only
when the size is small and known.

Correct:

```typescript
const response = await fetch(logUrl, { signal });
if (response.body === null) {
  throw new Error(`fetch ${logUrl}: response has no body`);
}
// readLines: an async generator over a byte stream, as in
// pkg/@eserstack/noskills-client/attach.ts
for await (const line of readLines(response.body)) {
  handle(line);
}
```

Incorrect:

```typescript
const text = await runtime.fs.readTextFile(logPath); // the whole log in memory
text.split("\n").forEach(handle);
```

**Why:** memory stays constant however large the input grows, and the first
result arrives before the last byte is read.

---

## Owned Asynchronous Work

Scope: Promises in TypeScript, goroutines in Go

Rule: Every asynchronous operation that is started is either awaited or owned by
something that waits for it and handles its error. Work that is deliberately
detached goes through a named helper that logs or reports failures.

Correct:

```typescript
await Promise.all(files.map((f) => processFile(f)));

runInBackground("refresh cache", () => refreshCache()); // helper catches + logs
```

```go
g, ctx := errgroup.WithContext(ctx)
for _, f := range files {
    g.Go(func() error { return processFile(ctx, f) })
}
if err := g.Wait(); err != nil {
    return fmt.Errorf("process files: %w", err)
}
```

Incorrect:

```typescript
files.forEach((f) => processFile(f)); // rejections are lost
```

```go
go processFile(ctx, f) // nobody waits, the error is dropped
```

**Why:** an unowned promise loses its rejection; an unowned goroutine leaks and
hides its failure.

---

## Performance Claims Need Measurement

Scope: Changes made for performance, and any code or review comment claiming one

Rule: A performance claim comes with a measurement: a `*.bench.ts` run with
`deno bench`, or `go test -bench`, before and after, on the same machine. Report
the numbers and the command. Without a measurement, write the plain version.

- Profile before choosing what to change. If most of the time is spent waiting
  on a database, an upstream service or the disk, fix that component; faster
  code in the process will not show.
- Fix the algorithm before the constants: replacing a linear search in a loop
  with a map lookup beats any tuning of the loop.
- Change one thing at a time and repeat each run several times; a single run
  before and after cannot tell a small gain from noise.
- Comment an optimization that makes the code less obvious with what it avoids
  and the measured gain, so nobody reverts it as needless complexity.
- Check new loops over I/O for per-item calls that can be batched (lint:
  `no-await-in-loop` flags the TypeScript case), and check that buffers and
  caches have a bound.

The Go procedure (`benchstat`, pprof) is in go-practices: Benchmark, Change,
Compare.

**Why:** intuition about bottlenecks is usually wrong, and an unmeasured
optimization costs readability for a gain nobody can confirm.
