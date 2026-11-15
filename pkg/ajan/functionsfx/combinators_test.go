// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package functionsfx_test

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/functionsfx"
)

func TestAllParRunsAtMostTheLimitAtOnce(t *testing.T) {
	t.Parallel()

	var running, peak atomic.Int32

	task := func(context.Context) (int, error) {
		now := running.Add(1)

		for {
			seen := peak.Load()
			if now <= seen || peak.CompareAndSwap(seen, now) {
				break
			}
		}

		time.Sleep(10 * time.Millisecond)
		running.Add(-1)

		return 1, nil
	}

	tasks := make([]functionsfx.Task[int], 20)
	for i := range tasks {
		tasks[i] = task
	}

	values, err := functionsfx.AllPar(tasks, functionsfx.WithParallelism(3))(t.Context())
	if err != nil || len(values) != 20 {
		t.Fatalf("AllPar = (%d values, %v)", len(values), err)
	}

	if got := peak.Load(); got > 3 {
		t.Errorf("%d tasks ran at once, want at most 3", got)
	}
}

func TestAllParCancelsTheOthersAtTheFirstFailure(t *testing.T) {
	t.Parallel()

	var cancelled atomic.Int32

	// The two waiting tasks tell when they run, and the failing one waits for
	// both, so the failure always comes with the others already started.
	started := make(chan struct{}, 2)

	waiting := func(ctx context.Context) (int, error) {
		started <- struct{}{}

		<-ctx.Done()
		cancelled.Add(1)

		return 0, ctx.Err()
	}

	failure := functionsfx.NewValidationError("bad")
	tasks := []functionsfx.Task[int]{
		waiting,
		func(context.Context) (int, error) {
			<-started
			<-started

			return 0, failure
		},
		waiting,
	}

	_, err := functionsfx.AllPar(tasks)(t.Context())

	if !functionsfx.IsKind(err, functionsfx.KindValidation) {
		t.Errorf("error = %v, want the first failure, a ValidationError", err)
	}

	if got := cancelled.Load(); got != 2 {
		t.Errorf("%d tasks saw their context end, want 2", got)
	}
}

func TestAllParStartsNoTaskAfterAFailure(t *testing.T) {
	t.Parallel()

	var started atomic.Int32

	tasks := make([]functionsfx.Task[int], 10)
	tasks[0] = func(context.Context) (int, error) { return 0, errors.New("first fails") } //nolint:err113

	for i := 1; i < len(tasks); i++ {
		tasks[i] = func(ctx context.Context) (int, error) {
			started.Add(1)
			<-ctx.Done()

			return 0, ctx.Err()
		}
	}

	if _, err := functionsfx.AllPar(tasks, functionsfx.WithParallelism(1))(t.Context()); err == nil {
		t.Fatal("AllPar succeeded, want the failure")
	}

	if got := started.Load(); got != 0 {
		t.Errorf("%d tasks started after the failure with a limit of one, want 0", got)
	}
}

func TestAllParTurnsAPanicIntoAnError(t *testing.T) {
	t.Parallel()

	tasks := []functionsfx.Task[int]{
		func(context.Context) (int, error) { panic("boom") },
	}

	_, err := functionsfx.AllPar(tasks)(t.Context())
	if err == nil || !strings.Contains(err.Error(), "panicked: boom") {
		t.Errorf("error = %v, want a panic error", err)
	}
}

func TestAllParStopsWhenTheCallerContextEnds(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	tasks := []functionsfx.Task[int]{functionsfx.Succeed(1), functionsfx.Succeed(2)}

	_, err := functionsfx.AllPar(tasks)(ctx)
	if !functionsfx.IsKind(err, functionsfx.KindAbort) {
		t.Errorf("error = %v, want an abort", err)
	}
}

func TestWithParallelismIgnoresALimitBelowOne(t *testing.T) {
	t.Parallel()

	values, err := functionsfx.AllPar([]functionsfx.Task[int]{functionsfx.Succeed(1)}, functionsfx.WithParallelism(0))(t.Context())
	if err != nil || len(values) != 1 {
		t.Errorf("AllPar = (%v, %v), want the default limit to apply", values, err)
	}
}

func TestWithTimeoutEndsATaskThatRunsTooLong(t *testing.T) {
	t.Parallel()

	slow := func(ctx context.Context) (string, error) {
		<-ctx.Done()

		return "", ctx.Err()
	}

	_, err := functionsfx.WithTimeout(slow, 20*time.Millisecond)(t.Context())

	if !functionsfx.IsKind(err, functionsfx.KindAbort) {
		t.Fatalf("kind = %q, want AbortError (error: %v)", functionsfx.KindOf(err), err)
	}

	if got := functionsfx.MessageOf(err); got != "Operation timed out after 20ms" {
		t.Errorf("message = %q", got)
	}
}

func TestWithTimeoutDoesNotWaitForATaskThatIgnoresItsContext(t *testing.T) {
	t.Parallel()

	release := make(chan struct{})
	defer close(release)

	stubborn := func(context.Context) (string, error) {
		<-release

		return "late", nil
	}

	start := time.Now()
	_, err := functionsfx.WithTimeout(stubborn, 20*time.Millisecond)(t.Context())

	if !functionsfx.IsKind(err, functionsfx.KindAbort) {
		t.Errorf("error = %v, want an abort", err)
	}

	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Errorf("WithTimeout waited %v for a task that ignores its context", elapsed)
	}
}

func TestWithTimeoutAnswersAFastTaskAsItIs(t *testing.T) {
	t.Parallel()

	got, err := functionsfx.WithTimeout(functionsfx.Succeed("quick"), time.Second)(t.Context())
	if err != nil || got != "quick" {
		t.Errorf("WithTimeout = (%q, %v)", got, err)
	}

	failure := errors.New("plain failure") //nolint:err113

	_, err = functionsfx.WithTimeout(functionsfx.Fail[string](failure), time.Second)(t.Context())
	if !errors.Is(err, failure) {
		t.Errorf("a task's own failure came back as %v", err)
	}
}

func TestWithTimeoutOfZeroLeavesTheContextToEndIt(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(t.Context())

	task := functionsfx.WithTimeout(func(ctx context.Context) (string, error) {
		<-ctx.Done()

		return "", ctx.Err()
	}, 0)

	go func() {
		time.Sleep(20 * time.Millisecond)
		cancel()
	}()

	_, err := task(ctx)

	if got := functionsfx.MessageOf(err); got != "Operation aborted" {
		t.Errorf("message = %q, want %q", got, "Operation aborted")
	}
}

func TestWithTimeoutRefusesAContextThatAlreadyEnded(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	var ran atomic.Bool

	_, err := functionsfx.WithTimeout(func(context.Context) (string, error) {
		ran.Store(true)

		return "", nil
	}, time.Second)(ctx)

	if got := functionsfx.MessageOf(err); got != "Operation was already aborted" {
		t.Errorf("message = %q", got)
	}

	if ran.Load() {
		t.Error("the task ran on a context that had ended")
	}
}

func TestWithLoggingLogsTheStartAndTheEnd(t *testing.T) {
	t.Parallel()

	var (
		buffer bytes.Buffer
		mu     sync.Mutex
	)

	logger := slog.New(slog.NewTextHandler(&lockedWriter{buffer: &buffer, mu: &mu}, nil))

	if _, err := functionsfx.WithLogging(functionsfx.Succeed(1), logger, "fetch-data")(t.Context()); err != nil {
		t.Fatal(err)
	}

	_, _ = functionsfx.WithLogging(functionsfx.Fail[int](errors.New("down")), logger, "save")(t.Context()) //nolint:err113

	mu.Lock()
	logged := buffer.String()
	mu.Unlock()

	for _, want := range []string{
		`msg="[fetch-data] started"`,
		`msg="[fetch-data] completed"`,
		`msg="[save] started"`,
		`msg="[save] failed"`,
		`error=down`,
	} {
		if !strings.Contains(logged, want) {
			t.Errorf("the log lacks %s:\n%s", want, logged)
		}
	}

	if strings.Contains(logged, "[save] completed") {
		t.Error("a failed task logged completed")
	}
}

type lockedWriter struct {
	buffer *bytes.Buffer
	mu     *sync.Mutex
}

func (w *lockedWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	return w.buffer.Write(p)
}

func TestMapAndThenPassTheErrorUnchanged(t *testing.T) {
	t.Parallel()

	failure := functionsfx.NewAdaptError("bad event", errors.New("cause")) //nolint:err113

	_, err := functionsfx.Map(functionsfx.Fail[int](failure), func(int) int { return 1 })(t.Context())
	if !functionsfx.IsKind(err, functionsfx.KindAdapt) {
		t.Errorf("Map error = %v, want the AdaptError", err)
	}

	_, err = functionsfx.Then(functionsfx.Fail[int](failure), func(int) functionsfx.Task[int] { return functionsfx.Succeed(1) })(t.Context())
	if !functionsfx.IsKind(err, functionsfx.KindAdapt) {
		t.Errorf("Then error = %v, want the AdaptError", err)
	}
}

func TestRetryStopsWhenTheContextEnds(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(t.Context())

	var calls atomic.Int32

	task := func(context.Context) (int, error) {
		if calls.Add(1) == 1 {
			cancel()
		}

		return 0, errors.New("always fails") //nolint:err113
	}

	_, err := functionsfx.Retry(task, 5, time.Hour)(ctx)

	if !errors.Is(err, context.Canceled) {
		t.Errorf("error = %v, want context.Canceled", err)
	}

	if got := calls.Load(); got != 1 {
		t.Errorf("task ran %d times, want 1: the wait between attempts must end with the context", got)
	}
}

func TestRetryWaitsForReal(t *testing.T) {
	t.Parallel()

	var calls int

	start := time.Now()

	got, err := functionsfx.Retry(func(context.Context) (string, error) {
		calls++

		if calls < 3 {
			return "", errors.New("flaky") //nolint:err113
		}

		return "done", nil
	}, 3, 15*time.Millisecond)(t.Context())

	if err != nil || got != "done" {
		t.Fatalf("Retry = (%q, %v)", got, err)
	}

	if elapsed := time.Since(start); elapsed < 25*time.Millisecond {
		t.Errorf("Retry took %v, want it to wait twice 15ms", elapsed)
	}
}

func TestRetryWithBackoffUsesTheDefaultsOfAnEmptyBackoff(t *testing.T) {
	t.Parallel()

	waits := &recorder{}
	calls := 0

	_, err := functionsfx.RetryWithBackoff(flaky(9, &calls), functionsfx.Backoff{}, functionsfx.WithSleeper(waits.sleep))(t.Context())

	if err == nil {
		t.Fatal("RetryWithBackoff succeeded, want the last failure")
	}

	if calls != functionsfx.DefaultBackoffAttempts {
		t.Errorf("calls = %d, want the default %d", calls, functionsfx.DefaultBackoffAttempts)
	}
}
