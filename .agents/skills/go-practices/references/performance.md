# Go Performance

Go tools and techniques for removing a measured bottleneck. The method (profile
first, rule out waiting on dependencies, fix the algorithm, change one thing at
a time, comment what an optimization buys) is coding-practices: Performance
Claims Need Measurement. Everything below is a candidate to try after a profile
points at the code, not a default style.

## Contents

- Find Where the Time Goes
- Benchmark, Change, Compare
- Algorithms Before Constants
- Allocations
- Cache Work That Repeats
- CPU
- I/O and Network
- Runtime Settings
- Production Signals
- Common Mistakes

---

## Find Where the Time Goes

| Symptom                                 | Tool and signal                                                    |
| --------------------------------------- | ------------------------------------------------------------------ |
| High CPU                                | CPU profile: the function with the largest flat or cumulative time |
| Many allocations, high GC share         | Heap profile with `-sample_index=alloc_objects`                    |
| Memory keeps growing                    | Heap profile with `inuse_space`; compare two snapshots             |
| Latency high, CPU low                   | Goroutine profile: goroutines blocked in network or `database/sql` |
| Goroutine count rising                  | Goroutine profile: a stack that keeps accumulating                 |
| Throughput stops scaling with cores     | Mutex and block profiles                                           |
| Stages idle while waiting on each other | `go tool trace`                                                    |
| A value escapes to the heap             | `go build -gcflags=-m` (`-m -m` prints the reason)                 |
| A small helper is not inlined           | `go build -gcflags=-m`, look for `cannot inline`                   |

When goroutines mostly wait, the time is off-CPU and the CPU profile misses it:
the goroutine profile, the trace and OpenTelemetry spans show which dependency
is slow.

Getting profiles in this repository:

```bash
go test -bench=BenchmarkRender -cpuprofile=etc/temp/cpu.out -memprofile=etc/temp/mem.out ./pkg/ajan/formatfx/
go tool pprof -http=:0 etc/temp/cpu.out
```

A running `httpfx` service exposes `/debug/pprof/` through the profiling module
(`pkg/ajan/httpfx/modules/profiling`). The endpoints reveal memory contents and
stacks, so they stay behind `PPROF_TOKEN` and off public listeners
(security-practices: Secrets and Personal Data Never Reach Output).

---

## Benchmark, Change, Compare

Scope: Every change made for performance

Rule:

1. Name the metric you are improving: latency, throughput, memory or CPU.
2. Write a benchmark that exercises one function, using `for b.Loop()` (Go
   1.24+), and report allocations.
3. Record a baseline, run the same command after one change, compare:

```bash
go test -run='^$' -bench=BenchmarkRender -benchmem -count=10 ./pkg/ajan/formatfx/ > etc/temp/bench-1.txt
# apply one change
go test -run='^$' -bench=BenchmarkRender -benchmem -count=10 ./pkg/ajan/formatfx/ > etc/temp/bench-2.txt
go tool benchstat etc/temp/bench-1.txt etc/temp/bench-2.txt
```

`benchstat` comes from `golang.org/x/perf/cmd/benchstat`; add it as a `tool`
directive the first time it is needed. Run benchmarks one after another on an
otherwise quiet machine: two benchmark runs sharing CPUs distort each other,
even when the variants were written in parallel. Keep the result files under
`etc/temp/` (gitignored) and put the `benchstat` table in the body of the
`perf:` commit.

```go
func BenchmarkRender(b *testing.B) {
    rows := sampleRows(1_000)
    b.ReportAllocs()
    for b.Loop() {
        Render(rows)
    }
}
```

---

## Algorithms Before Constants

| Pattern                                  | Cost            | Replace with                          |
| ---------------------------------------- | --------------- | ------------------------------------- |
| `slices.Contains` inside a loop          | O(n·m)          | Build a `map[T]struct{}` once: O(n+m) |
| Nested loops to match two collections    | O(n·m)          | Index one side by key in a map        |
| Repeated min, max or lookups on one list | O(n) per query  | Sort once, `slices.BinarySearch`      |
| `append` in a loop with a known size     | Repeated growth | `make([]T, 0, n)`                     |
| `s += part` in a loop                    | O(n²) copying   | `strings.Builder`                     |

Test the growth: benchmark with 100, 1,000 and 10,000 items; ten times the input
taking a hundred times as long means the algorithm is quadratic. In a hot path
prefer one direct loop over a chain of iterator adapters, each of which adds a
closure call per element.

---

## Allocations

Preallocation, cloning and map sizing are covered in
[data-structures.md](data-structures.md). In hot paths, also:

- **Reuse a slice's backing array** with `buf = buf[:0]` or
  `buf = append(buf[:0], items...)`, when nothing else still holds the old
  contents.
- **Take the value from `range`** (`for k, v := range m`) instead of indexing
  the map again inside the loop.
- **Return sentinel errors** for expected failures on a hot path; `fmt.Errorf`
  allocates on every call. Keep wrapping with context everywhere else
  (errors-and-logging.md: Error Handling).
- **Avoid boxing into `any`.** Passing a concrete value through `any` or a
  `...any` parameter usually allocates. Use a typed parameter or a type
  parameter.
- **Convert between `string` and `[]byte` once.** Each conversion copies. The
  `bytes` package mirrors most of `strings`, so work on `[]byte` directly when
  that is what you have.

### Pooling

`sync.Pool` keeps short-lived objects between uses. Use it for objects created
on every request or record (encoding buffers, scratch structs), and only after a
heap profile shows that allocation near the top:

```go
var bufferPool = sync.Pool{New: func() any { return new(bytes.Buffer) }}

const maxPooledBuffer = 64 << 10

func EncodeSession(s *Session) ([]byte, error) {
    buf := bufferPool.Get().(*bytes.Buffer)
    buf.Reset()
    defer func() {
        if buf.Cap() <= maxPooledBuffer { // a rare huge buffer is left to the GC
            bufferPool.Put(buf)
        }
    }()

    if err := json.NewEncoder(buf).Encode(s); err != nil {
        return nil, fmt.Errorf("encode session %q: %w", s.ID, err)
    }
    return bytes.Clone(buf.Bytes()), nil // pooled memory never leaves this function
}
```

- Reset an object when taking it out, and drop references it holds, so the pool
  does not keep large graphs alive.
- Never return pooled memory to a caller; return a copy.
- Cap what goes back into the pool. One oversized buffer, once pooled, keeps its
  memory for as long as the pool reuses it.
- Do not pool rarely created objects; the pool costs more than it saves.

### Memory Held by Small Views

A sub-slice or substring keeps its whole backing array alive; copy what you keep
from a large input (`bytes.Clone(frame[:16])`, `strings.Clone(line[:8])`).

---

## Cache Work That Repeats

Compile regular expressions and parse templates once (language.md: Regular
Expressions). For lazily computed values use `sync.OnceValue`. Any cache follows
coding-practices: Bound Every Resource.

When many callers miss the same cache key at once, they all do the same
expensive fetch. `golang.org/x/sync/singleflight` lets one of them fetch while
the others wait for its result. Use `DoChan` so each caller still honors its own
context, and give the shared fetch a context of its own: it must not fail
because the first caller gave up.

```go
type ManifestCache struct {
    group   singleflight.Group
    fetcher ManifestFetcher
    cache   *BoundedCache[string, *Manifest]
}

func (c *ManifestCache) Get(ctx context.Context, url string) (*Manifest, error) {
    if m, ok := c.cache.Get(url); ok {
        return m, nil
    }

    ch := c.group.DoChan(url, func() (any, error) {
        fetchCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
        defer cancel()

        m, err := c.fetcher.Fetch(fetchCtx, url)
        if err == nil {
            c.cache.Add(url, m)
        }
        return m, err
    })

    select {
    case <-ctx.Done():
        return nil, ctx.Err()
    case res := <-ch:
        if res.Err != nil {
            return nil, fmt.Errorf("fetch manifest %s: %w", url, res.Err)
        }
        return res.Val.(*Manifest), nil
    }
}
```

The typed wrapper keeps the `any` assertion in one place. For eviction, a
generic LRU such as `hashicorp/golang-lru/v2` (already in the module graph as an
indirect dependency) still goes through tooling-standards: Adding a Dependency
before code imports it directly.

---

## CPU

### Inlining

The compiler inlines small functions, which removes call overhead in tight
loops. A call to something that cannot be inlined, such as a logging call, can
push a small helper over the budget. Keep side effects out of hot helpers, and
check the decision:

```bash
go build -gcflags=-m ./pkg/ajan/formatfx/ 2>&1 | grep -E "can inline|cannot inline"
```

Receiver kind does not decide inlining: methods with pointer receivers inline as
well. Choose receivers by language.md: Value vs Pointer Parameters, not to chase
inlining.

### Logging in Hot Paths

A disabled log call still evaluates its arguments, and `...any` arguments are
boxed before the level check runs. In a loop, check the level once and build
attributes only when it is enabled; `LogAttrs` avoids the boxing:

```go
if logger.Enabled(ctx, logfx.LevelTrace) {
    logger.LogAttrs(ctx, logfx.LevelTrace, "row rendered",
        slog.Int("index", i), slog.Duration("took", time.Since(start)))
}
```

### Reflection

`reflect` and `reflect.DeepEqual` inspect types at run time and allocate. In
production code compare with `slices.Equal`, `maps.Equal`, `bytes.Equal` or a
typed `Equal` method; keep `DeepEqual` for tests. Dispatch on a dynamic type
with one type switch instead of a series of type assertions.

### Memory Layout and Locality

- Order struct fields from largest to smallest alignment only for types held in
  large slices or maps (`unsafe.Sizeof` confirms the saving). The
  `fieldalignment` analyzer lists candidates when run on demand; it is not
  enabled in `.golangci.yaml`, because elsewhere reordering only costs
  readability.
- Keep hot data contiguous: one slice for a matrix, nodes in a slice linked by
  index, a struct of slices when a hot loop reads one field of many structs.

### Last-Resort Techniques

Each of these makes code harder to read. Use one only with a benchmark on a
profiled hot path, and leave a comment with the numbers:

- **False sharing.** Counters updated by different goroutines on the same 64
  byte cache line slow each other down. Pad them apart (`_ [56]byte` after an
  `atomic.Int64`, or `cpu.CacheLinePad` from `golang.org/x/sys/cpu`). The sign
  is a concurrent benchmark that gets slower as goroutines are added.
- **Several accumulators.** A tight arithmetic loop with one accumulator waits
  on each previous addition; splitting it into four independent sums lets the
  CPU run them in parallel.
- **SIMD and assembly.** Rely on the compiler's vectorization and `math/bits`.
  `simd/archsimd` is a Go 1.26 experiment behind `GOEXPERIMENT=simd`; do not use
  it here. Hand-written assembly needs an ADR. Pick a CPU-specific path in a
  package-level variable initializer (`golang.org/x/sys/cpu`), never in
  `init()`, and keep the portable version tested.
- **`unsafe`.** Only for FFI and layout (data-structures.md).

### The Scheduler

Goroutines are preempted asynchronously since Go 1.14. Do not add
`//go:noinline` or artificial calls to create preemption points.

---

## I/O and Network

### HTTP Clients and Servers

The zero `http.Client` has no timeout, and `http.Transport` keeps only 2 idle
connections per host by default, so concurrent calls to one service keep opening
new connections. Use `pkg/ajan/httpclient`, whose transport defaults already
raise the pool (`max_idle_conns_per_host: 100`) and whose calls take a context,
rather than a bare `http.Client`. Servers go through `httpfx`, which sets
`ReadHeaderTimeout`, `ReadTimeout`, `WriteTimeout` and `IdleTimeout` from
config. A hand-built `http.Server` sets all four (coding-practices: External
Calls Have Timeouts).

A connection returns to the pool only after its body is read to the end and
closed. When the body does not matter, drain a bounded amount:

```go
defer resp.Body.Close()
_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10)) // best effort: reuse the connection
```

### Streaming and Buffering

Read large or unbounded input as a stream (coding-practices: Stream Large Data):
`io.Copy` between reader and writer, `bufio.Scanner` for lines, and
`json.NewDecoder` with `More()` for a large JSON array. `io.ReadAll` is fine for
input already bounded by `io.LimitReader` or `http.MaxBytesReader`.

Many small reads or writes cost one system call each. Wrap files and sockets in
`bufio.Reader` or `bufio.Writer`, and check the error of the final `Flush`.

### Batching

One round trip per item multiplies latency by the item count. Send many items
per call:

- PostgreSQL through `connfx`: `pgx.Batch` with `SendBatch` for many statements,
  `CopyFrom` for bulk inserts. Both take `ctx` and return errors to check.
- HTTP: use the API's batch endpoint when it has one.
- Across the FFI bridge (`pkg/@eserstack/ajan`): each call from the host runtime
  into Go costs far more than a Go call. Pass a whole list per call, not one
  item.

A consumer that batches a stream flushes on size and on time, and stops with its
context:

```go
func (w *AuditWriter) Run(ctx context.Context, events <-chan AuditEvent) error {
    batch := make([]AuditEvent, 0, w.batchSize)
    ticker := time.NewTicker(w.flushInterval)
    defer ticker.Stop()

    flush := func() error {
        if len(batch) == 0 {
            return nil
        }
        err := w.store.InsertEvents(ctx, batch)
        batch = batch[:0]
        return err
    }

    for {
        select {
        case <-ctx.Done():
            return ctx.Err()
        case e, ok := <-events:
            if !ok {
                return flush()
            }
            batch = append(batch, e)
            if len(batch) == w.batchSize {
                if err := flush(); err != nil {
                    return fmt.Errorf("flush audit batch: %w", err)
                }
            }
        case <-ticker.C:
            if err := flush(); err != nil {
                return fmt.Errorf("flush audit batch: %w", err)
            }
        }
    }
}
```

### Concurrent Pipeline Stages

Run stages concurrently only when each is limited by a different resource (CPU,
disk, network), a trace shows one idle while another is busy, and the sequential
version with batching was measured and is slower. Bound the channels between
stages (coding-practices: Bound Every Resource) and run the stages with
`errgroup.WithContext` (coding-practices: Owned Asynchronous Work).

---

## Runtime Settings

- `GOMAXPROCS` follows cgroup CPU limits since Go 1.25; do not set it by hand.
- Set `GOMEMLIMIT` for services with a container memory limit, to about 80-90%
  of that limit, so the GC works harder before the container is killed.
- Leave `GOGC` at its default unless a profile shows GC time is the problem.
- Profile-guided optimization: a `default.pgo` CPU profile from production in
  the main package is used by `go build` automatically. Commit one only with a
  benchmark showing the gain, and refresh it when the code changes a lot.

---

## Production Signals

`runtime/metrics` exposes the runtime's own counters without a dependency, and
OpenTelemetry exports them through `logfx`'s meter provider. Watch trends, not
single values:

| Metric                               | Watch for                                      |
| ------------------------------------ | ---------------------------------------------- |
| `/gc/heap/allocs:bytes`              | Allocation rate rising after a deploy          |
| `/gc/cycles/total:gc-cycles`         | GC frequency rising with steady load           |
| `/cpu/classes/gc/total:cpu-seconds`  | Share of CPU spent in the GC                   |
| `/memory/classes/heap/objects:bytes` | Live heap climbing under constant load: a leak |
| `/sched/goroutines:goroutines`       | Goroutines growing independently of traffic    |
| `/sched/latencies:seconds`           | Goroutines waiting long for a CPU              |
| `/sync/mutex/wait/total:seconds`     | Lock contention                                |

Request latency comes from the `httpfx` metrics and trace spans. Continuous
profiling services (Pyroscope, Parca and similar) add infrastructure and a
dependency; they need an ADR first.

---

## Common Mistakes

| Mistake                                           | Fix                                                 |
| ------------------------------------------------- | --------------------------------------------------- |
| One benchmark run before and after                | `-count=10` and `benchstat`                         |
| A bare `http.Client` or `http.Server`             | `httpclient` and `httpfx`, or set timeouts and pool |
| Not draining response bodies                      | Bounded `io.Copy(io.Discard, ...)`, then close      |
| `io.ReadAll` on unbounded input                   | Stream, or bound with `io.LimitReader`              |
| Log calls with computed arguments in a hot loop   | `Enabled` check and `LogAttrs`                      |
| `reflect.DeepEqual` in production code            | Typed equality                                      |
| `panic` and `recover` for control flow            | Return errors                                       |
| Returning pooled buffers to callers               | Return a copy                                       |
| Keeping a small sub-slice of a large buffer       | `bytes.Clone` or `strings.Clone`                    |
| `//go:noinline` to help the scheduler             | Nothing; preemption is asynchronous since Go 1.14   |
| `unsafe`, padding or assembly without a benchmark | Measure on the hot path, or leave it out            |
