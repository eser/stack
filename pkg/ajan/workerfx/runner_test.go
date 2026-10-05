package workerfx_test

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"testing/synctest"
	"time"

	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/eser/stack/pkg/ajan/workerfx"
)

var errSyncFailed = errors.New("sync failed")

// fakeWorker counts its executions and hands each one to execute, which
// decides the outcome for that call number (starting at 1).
type fakeWorker struct {
	name     string
	interval time.Duration
	execute  func(ctx context.Context, call int64) error
	calls    atomic.Int64
}

func (w *fakeWorker) Name() string {
	return w.name
}

func (w *fakeWorker) Interval() time.Duration {
	return w.interval
}

func (w *fakeWorker) Execute(ctx context.Context) error {
	call := w.calls.Add(1)
	if w.execute == nil {
		return nil
	}

	return w.execute(ctx, call)
}

// syncBuffer is a bytes.Buffer the runner goroutine can write while the test
// reads it.
type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	return b.buf.Write(p)
}

func (b *syncBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()

	return b.buf.String()
}

func newTestLogger(out *syncBuffer) *logfx.Logger {
	return logfx.NewLogger(
		logfx.WithWriter(out),
		logfx.WithConfig(&logfx.Config{Level: "INFO"}),
	)
}

// startRunner runs runner in the background and returns a function that
// cancels it and returns what Run returned.
func startRunner(t *testing.T, runner *workerfx.Runner) func() error {
	t.Helper()

	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)

	go func() {
		done <- runner.Run(ctx)
	}()

	return func() error {
		cancel()

		return <-done
	}
}

func TestRunnerRecordsEachOutcome(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name        string
		execute     func(ctx context.Context, call int64) error
		wantSuccess int64
		wantSkip    int64
		wantErrors  int64
		wantErr     error
		wantLog     string
	}{
		{
			name: "success",
			execute: func(context.Context, int64) error {
				return nil
			},
			wantSuccess: 1,
		},
		{
			name: "wrapped skip signal",
			execute: func(context.Context, int64) error {
				return fmt.Errorf("no new rows: %w", workerfx.ErrWorkerSkipped)
			},
			wantSkip: 1,
		},
		{
			name: "failure",
			execute: func(context.Context, int64) error {
				return errSyncFailed
			},
			wantErrors: 1,
			wantErr:    errSyncFailed,
			wantLog:    "Worker execution failed",
		},
		{
			name: "panic",
			execute: func(context.Context, int64) error {
				panic("index out of range")
			},
			wantErrors: 1,
			wantErr:    workerfx.ErrWorkerPanicked,
			wantLog:    "Worker panicked",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			synctest.Test(t, func(t *testing.T) {
				logs := &syncBuffer{}
				worker := &fakeWorker{
					name:     "sync-feeds",
					interval: time.Hour,
					execute: func(ctx context.Context, call int64) error {
						time.Sleep(3 * time.Second) // virtual time inside the bubble

						return tc.execute(ctx, call)
					},
				}
				runner := workerfx.NewRunner(worker, newTestLogger(logs))
				startedAt := time.Now()

				stop := startRunner(t, runner)

				// The worker's sleep only ends once this goroutine moves the
				// bubble's clock past it.
				time.Sleep(3 * time.Second)
				synctest.Wait()

				status := runner.Status()

				if err := stop(); err != nil {
					t.Fatalf("Run() = %v, want nil", err)
				}

				if status.SuccessCount != tc.wantSuccess ||
					status.SkipCount != tc.wantSkip ||
					status.ErrorCount != tc.wantErrors {
					t.Errorf(
						"counts (success, skip, error) = (%d, %d, %d), want (%d, %d, %d)",
						status.SuccessCount, status.SkipCount, status.ErrorCount,
						tc.wantSuccess, tc.wantSkip, tc.wantErrors,
					)
				}

				// errors.Is(err, nil) holds only for a nil err, so this also
				// covers the cases that want no error.
				if !errors.Is(status.LastError, tc.wantErr) {
					t.Errorf("LastError = %v, want %v", status.LastError, tc.wantErr)
				}

				if status.IsRunning {
					t.Error("IsRunning = true after the execution finished")
				}

				if !status.LastRun.Equal(startedAt) {
					t.Errorf("LastRun = %v, want %v", status.LastRun, startedAt)
				}

				if status.LastDuration != 3*time.Second {
					t.Errorf("LastDuration = %v, want 3s", status.LastDuration)
				}

				if tc.wantLog != "" {
					out := logs.String()
					if !strings.Contains(out, tc.wantLog) || !strings.Contains(out, "sync-feeds") {
						t.Errorf("log output %q does not contain %q for worker sync-feeds", out, tc.wantLog)
					}
				}
			})
		})
	}
}

func TestRunnerPanicKeepsTheValueInTheError(t *testing.T) {
	t.Parallel()

	synctest.Test(t, func(t *testing.T) {
		worker := &fakeWorker{
			name:     "rebuild-index",
			interval: time.Hour,
			execute: func(context.Context, int64) error {
				panic("nil map write")
			},
		}
		runner := workerfx.NewRunner(worker, newTestLogger(&syncBuffer{}))

		stop := startRunner(t, runner)
		synctest.Wait()

		lastErr := runner.Status().LastError

		if err := stop(); err != nil {
			t.Fatalf("Run() = %v, want nil", err)
		}

		if lastErr == nil || !strings.Contains(lastErr.Error(), "nil map write") {
			t.Errorf("LastError = %v, want it to carry the panic value %q", lastErr, "nil map write")
		}
	})
}

func TestRunnerKeepsRunningAfterAPanic(t *testing.T) {
	t.Parallel()

	synctest.Test(t, func(t *testing.T) {
		worker := &fakeWorker{
			name:     "send-digests",
			interval: time.Hour,
			execute: func(_ context.Context, call int64) error {
				if call == 1 {
					panic("template missing")
				}

				return nil
			},
		}
		runner := workerfx.NewRunner(worker, newTestLogger(&syncBuffer{}))

		stop := startRunner(t, runner)
		synctest.Wait()

		runner.TriggerNow()
		synctest.Wait()

		status := runner.Status()

		if err := stop(); err != nil {
			t.Fatalf("Run() = %v, want nil", err)
		}

		if got := worker.calls.Load(); got != 2 {
			t.Fatalf("executions = %d, want 2", got)
		}

		if status.ErrorCount != 1 || status.SuccessCount != 1 {
			t.Errorf("(ErrorCount, SuccessCount) = (%d, %d), want (1, 1)", status.ErrorCount, status.SuccessCount)
		}

		if status.LastError != nil {
			t.Errorf("LastError = %v, want nil after a successful run", status.LastError)
		}
	})
}

func TestRunnerTriggerNowRunsWithoutWaitingForTheInterval(t *testing.T) {
	t.Parallel()

	synctest.Test(t, func(t *testing.T) {
		worker := &fakeWorker{name: "sync-feeds", interval: time.Hour}
		runner := workerfx.NewRunner(worker, newTestLogger(&syncBuffer{}))
		startedAt := time.Now()

		stop := startRunner(t, runner)
		synctest.Wait()

		runner.TriggerNow()
		synctest.Wait()

		if err := stop(); err != nil {
			t.Fatalf("Run() = %v, want nil", err)
		}

		if got := worker.calls.Load(); got != 2 {
			t.Errorf("executions = %d, want 2 (start, trigger)", got)
		}

		if elapsed := time.Since(startedAt); elapsed != 0 {
			t.Errorf("triggered run happened after %v of virtual time, want 0", elapsed)
		}
	})
}

func TestRunnerTriggerNowCoalescesWhileBusy(t *testing.T) {
	t.Parallel()

	synctest.Test(t, func(t *testing.T) {
		release := make(chan struct{})
		worker := &fakeWorker{
			name:     "sync-feeds",
			interval: time.Hour,
			execute: func(_ context.Context, call int64) error {
				if call == 1 {
					<-release
				}

				return nil
			},
		}
		runner := workerfx.NewRunner(worker, newTestLogger(&syncBuffer{}))

		stop := startRunner(t, runner)
		synctest.Wait()

		if !runner.Status().IsRunning {
			t.Error("IsRunning = false while the first execution is blocked")
		}

		runner.TriggerNow()
		runner.TriggerNow()
		runner.TriggerNow()

		close(release)
		synctest.Wait()

		if err := stop(); err != nil {
			t.Fatalf("Run() = %v, want nil", err)
		}

		if got := worker.calls.Load(); got != 2 {
			t.Errorf("executions = %d, want 2 (start, one coalesced trigger)", got)
		}
	})
}

func TestRunnerRunsOnEveryInterval(t *testing.T) {
	t.Parallel()

	synctest.Test(t, func(t *testing.T) {
		worker := &fakeWorker{name: "sync-feeds", interval: time.Minute}
		runner := workerfx.NewRunner(worker, newTestLogger(&syncBuffer{}))

		stop := startRunner(t, runner)

		time.Sleep(3*time.Minute + time.Second)
		synctest.Wait()

		if err := stop(); err != nil {
			t.Fatalf("Run() = %v, want nil", err)
		}

		if got := worker.calls.Load(); got != 4 {
			t.Errorf("executions after 3m1s = %d, want 4 (start and three ticks)", got)
		}
	})
}

func TestRunnerStopsWhenTheContextEnds(t *testing.T) {
	t.Parallel()

	synctest.Test(t, func(t *testing.T) {
		logs := &syncBuffer{}
		worker := &fakeWorker{name: "sync-feeds", interval: time.Minute}
		runner := workerfx.NewRunner(worker, newTestLogger(logs))

		stop := startRunner(t, runner)
		synctest.Wait()

		if err := stop(); err != nil {
			t.Fatalf("Run() = %v, want nil", err)
		}

		time.Sleep(10 * time.Minute)

		if got := worker.calls.Load(); got != 1 {
			t.Errorf("executions = %d, want 1: none after the context ended", got)
		}

		if out := logs.String(); !strings.Contains(out, "Worker stopped") {
			t.Errorf("log output %q does not report the stop", out)
		}
	})
}

func TestRunnerWithZeroIntervalRunsBackToBack(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()

	worker := &fakeWorker{
		name:     "drain-queue",
		interval: 0,
		execute: func(_ context.Context, call int64) error {
			if call == 5 {
				cancel()
			}

			return nil
		},
	}
	runner := workerfx.NewRunner(worker, newTestLogger(&syncBuffer{}))

	if err := runner.Run(ctx); err != nil {
		t.Fatalf("Run() = %v, want nil", err)
	}

	if got := worker.calls.Load(); got != 5 {
		t.Errorf("executions = %d, want 5: back to back until the fifth cancels", got)
	}

	if got := runner.Status().SuccessCount; got != 5 {
		t.Errorf("SuccessCount = %d, want 5", got)
	}
}

func TestRunnerStatusDescribesTheWorker(t *testing.T) {
	t.Parallel()

	worker := &fakeWorker{name: "sync-feeds", interval: 15 * time.Minute}
	runner := workerfx.NewRunner(worker, newTestLogger(&syncBuffer{}))

	runner.SetStateKey("workers:sync-feeds")

	status := runner.Status()

	if status.Name != "sync-feeds" || status.Interval != 15*time.Minute {
		t.Errorf("(Name, Interval) = (%q, %v), want (%q, %v)",
			status.Name, status.Interval, "sync-feeds", 15*time.Minute)
	}

	if status.StateKey != "workers:sync-feeds" {
		t.Errorf("StateKey = %q, want %q", status.StateKey, "workers:sync-feeds")
	}

	if status.IsRunning || !status.LastRun.IsZero() || status.SuccessCount != 0 {
		t.Errorf("status before any run = %+v, want no run recorded", status)
	}
}
