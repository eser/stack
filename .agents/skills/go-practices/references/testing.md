# Go Testing

How Go tests are written and run in this repository. The testing strategy
(levels, coverage, what to test) is architecture-guidelines' testing reference.

## Contents

- Table-Driven, Parallel, Race-Checked
- Fakes at the Port
- Concurrency Tests
- Benchmarks

---

## Table-Driven, Parallel, Race-Checked

Scope: All Go tests

Rule: Write table-driven tests with `t.Parallel()` at both the test and the
subtest level. Since Go 1.22 each loop iteration has its own variable, so the
old `tc := tc` copy is not needed. Use `t.Context()` (Go 1.24+) instead of
`context.Background()`. Tests run with the race detector: `make test` (or
`deno task cli go-test` for coverage). A test that cannot run in parallel (it
sets process environment or a global) says why in a comment.

Correct:

```go
func TestIsSessionStale(t *testing.T) {
    t.Parallel()

    now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
    cases := []struct {
        name       string
        lastActive time.Time
        want       bool
    }{
        {"active a minute ago", now.Add(-time.Minute), false},
        {"idle for two hours", now.Add(-2 * time.Hour), true},
        {"never active", time.Time{}, true},
    }

    for _, tc := range cases {
        t.Run(tc.name, func(t *testing.T) {
            t.Parallel()
            if got := IsSessionStale(tc.lastActive, now); got != tc.want {
                t.Errorf("IsSessionStale(%v) = %v, want %v", tc.lastActive, got, tc.want)
            }
        })
    }
}
```

Incorrect:

```go
func TestIsSessionStale(t *testing.T) {
    if !IsSessionStale(time.Time{}, time.Now()) { // one case, wall clock, serial
        t.Error("failed")
    }
}
```

---

## Fakes at the Port

Scope: Tests of business services

Rule: Test a service by passing hand-written fakes of its ports to the real
constructor. A fake is a small struct in the `_test.go` file that implements the
port with an in-memory map or a recorded call list; no mocking library. Pass a
real or no-op value for every parameter, never `nil` for a dependency the code
might call: a nil logger or clock turns a test failure into a panic far from the
cause. Keep the real adapters for integration tests, and fake only the boundary
under test (the database, an external API, the mailer).

```go
type fakeStore struct {
    sessions map[string]*Session
}

func (f *fakeStore) Get(_ context.Context, id string) (*Session, error) {
    s, ok := f.sessions[id]
    if !ok {
        return nil, ErrSessionNotFound
    }
    return s, nil
}

func TestServiceLoad(t *testing.T) {
    t.Parallel()

    store := &fakeStore{sessions: map[string]*Session{"s1": {ID: "s1"}}}
    now := func() time.Time { return time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC) }
    svc := NewService(store, now, slog.New(slog.DiscardHandler))

    got, err := svc.Load(t.Context(), "s1")
    if err != nil {
        t.Fatalf("Load(%q): %v", "s1", err)
    }
    if got.ID != "s1" {
        t.Errorf("Load(%q).ID = %q, want %q", "s1", got.ID, "s1")
    }
}
```

**Why:** a fake that implements the port breaks at compile time when the port
changes, and the test exercises the same constructor the composition root uses.

---

## Concurrency Tests

Scope: Tests of code with goroutines, timers or tickers

Rule: Use `testing/synctest.Test` (Go 1.25+) with `synctest.Wait` instead of
sleeping or polling; time inside the bubble is virtual, so the test is fast and
deterministic. `go test -race` passing does not prove the absence of races on
paths the tests do not run.

---

## Benchmarks

Scope: `Benchmark*` functions

Rule: Use `for b.Loop()` (Go 1.24+) and `b.ReportAllocs()`. How to compare runs
is in performance.md: Benchmark, Change, Compare.
