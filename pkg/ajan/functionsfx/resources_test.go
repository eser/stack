// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package functionsfx_test

import (
	"context"
	"errors"
	"reflect"
	"sync"
	"testing"

	"github.com/eser/stack/pkg/ajan/functionsfx"
)

func mustPanic(t *testing.T, want any, body func()) {
	t.Helper()

	defer func() {
		if got := recover(); got != want {
			t.Errorf("panic = %v, want %v", got, want)
		}
	}()

	body()
}

func TestBracketReleasesWhenTheUsePanics(t *testing.T) {
	t.Parallel()

	released := false

	task := functionsfx.Bracket(
		functionsfx.Succeed("resource"),
		func(string) functionsfx.Task[string] {
			return func(context.Context) (string, error) { panic("boom") }
		},
		func(string) { released = true },
	)

	mustPanic(t, "boom", func() { _, _ = task(t.Context()) })

	if !released {
		t.Error("the resource was not released when the use panicked")
	}
}

func TestBracketWithReleaseErrorReleasesWhenTheUsePanics(t *testing.T) {
	t.Parallel()

	released := false

	task := functionsfx.BracketWithReleaseError(
		functionsfx.Succeed("resource"),
		func(string) functionsfx.Task[string] {
			return func(context.Context) (string, error) { panic("boom") }
		},
		func(string) error {
			released = true

			return nil
		},
	)

	mustPanic(t, "boom", func() { _, _ = task(t.Context()) })

	if !released {
		t.Error("the resource was not released when the use panicked")
	}
}

func TestBracketPassesTheResourceToTheUseAndTheRelease(t *testing.T) {
	t.Parallel()

	var released string

	got, err := functionsfx.Bracket(
		functionsfx.Succeed("db"),
		func(resource string) functionsfx.Task[string] { return functionsfx.Succeed(resource + "-used") },
		func(resource string) { released = resource },
	)(t.Context())

	if err != nil || got != "db-used" || released != "db" {
		t.Errorf("Bracket = (%q, %v), released %q", got, err, released)
	}
}

func TestScopedClosesTheScopeAfterTheTask(t *testing.T) {
	t.Parallel()

	order := []string{}

	got, err := functionsfx.Scoped(func(scope *functionsfx.Scope) functionsfx.Task[string] {
		return func(ctx context.Context) (string, error) {
			first, err := functionsfx.AcquireRelease(scope, functionsfx.Succeed("first"), func(string) error {
				order = append(order, "release first")

				return nil
			})(ctx)
			if err != nil {
				return "", err
			}

			second, err := functionsfx.AcquireRelease(scope, functionsfx.Succeed("second"), func(string) error {
				order = append(order, "release second")

				return nil
			})(ctx)
			if err != nil {
				return "", err
			}

			order = append(order, "work")

			return first + "+" + second, nil
		}
	})(t.Context())

	if err != nil || got != "first+second" {
		t.Fatalf("Scoped = (%q, %v)", got, err)
	}

	if want := []string{"work", "release second", "release first"}; !reflect.DeepEqual(order, want) {
		t.Errorf("order = %v, want %v", order, want)
	}
}

func TestScopedClosesTheScopeWhenTheTaskFails(t *testing.T) {
	t.Parallel()

	released := false
	failure := functionsfx.NewValidationError("bad")

	_, err := functionsfx.Scoped(func(scope *functionsfx.Scope) functionsfx.Task[string] {
		return func(ctx context.Context) (string, error) {
			if _, err := functionsfx.AcquireRelease(scope, functionsfx.Succeed("r"), func(string) error {
				released = true

				return nil
			})(ctx); err != nil {
				return "", err
			}

			return "", failure
		}
	})(t.Context())

	if !functionsfx.IsKind(err, functionsfx.KindValidation) || !released {
		t.Errorf("Scoped = %v, released %v, want the failure and a release", err, released)
	}
}

func TestScopedJoinsAFailedCloseToTheTaskError(t *testing.T) {
	t.Parallel()

	taskFailure := errors.New("task failed")   //nolint:err113
	closeFailure := errors.New("close failed") //nolint:err113

	_, err := functionsfx.Scoped(func(scope *functionsfx.Scope) functionsfx.Task[string] {
		return func(context.Context) (string, error) {
			_ = scope.AddFinalizer(func() error { return closeFailure })

			return "", taskFailure
		}
	})(t.Context())

	if !errors.Is(err, taskFailure) || !errors.Is(err, closeFailure) {
		t.Errorf("error = %v, want both the task failure and the close failure", err)
	}
}

func TestScopedClosesTheScopeWhenTheTaskPanics(t *testing.T) {
	t.Parallel()

	released := false

	task := functionsfx.Scoped(func(scope *functionsfx.Scope) functionsfx.Task[string] {
		return func(context.Context) (string, error) {
			_ = scope.AddFinalizer(func() error {
				released = true

				return nil
			})

			panic("boom")
		}
	})

	mustPanic(t, "boom", func() { _, _ = task(t.Context()) })

	if !released {
		t.Error("the scope was not closed when the task panicked")
	}
}

func TestAcquireReleaseRegistersNothingWhenTheAcquireFails(t *testing.T) {
	t.Parallel()

	scope := functionsfx.NewScope()
	released := false
	failure := errors.New("no resource") //nolint:err113

	_, err := functionsfx.AcquireRelease(scope, functionsfx.Fail[string](failure), func(string) error {
		released = true

		return nil
	})(t.Context())

	if !errors.Is(err, failure) {
		t.Errorf("error = %v, want the acquire failure", err)
	}

	if closeErr := scope.Close(); closeErr != nil || released {
		t.Errorf("close = %v, released %v, want nothing to release", closeErr, released)
	}
}

func TestAcquireReleaseReleasesAtOnceWhenTheScopeIsClosed(t *testing.T) {
	t.Parallel()

	scope := functionsfx.NewScope()
	if err := scope.Close(); err != nil {
		t.Fatal(err)
	}

	released := false

	_, err := functionsfx.AcquireRelease(scope, functionsfx.Succeed("r"), func(string) error {
		released = true

		return nil
	})(t.Context())

	if !errors.Is(err, functionsfx.ErrScopeClosed) || !released {
		t.Errorf("error = %v, released %v, want ErrScopeClosed and the resource released", err, released)
	}
}

func TestEnsureJoinsAFailedFinalizerToTheTaskError(t *testing.T) {
	t.Parallel()

	taskFailure := errors.New("task failed")           //nolint:err113
	finalizerFailure := errors.New("finalizer failed") //nolint:err113

	_, err := functionsfx.Ensure(functionsfx.Fail[int](taskFailure), func() error { return finalizerFailure })(t.Context())

	if !errors.Is(err, taskFailure) || !errors.Is(err, finalizerFailure) {
		t.Errorf("error = %v, want both failures", err)
	}

	got, err := functionsfx.Ensure(functionsfx.Succeed(7), func() error { return finalizerFailure })(t.Context())
	if !errors.Is(err, finalizerFailure) || got != 7 {
		t.Errorf("a failing finalizer after a success: (%d, %v), want it to be the error", got, err)
	}
}

func TestScopeIsSafeForConcurrentUse(t *testing.T) {
	t.Parallel()

	scope := functionsfx.NewScope()

	var (
		group sync.WaitGroup
		mu    sync.Mutex
		count int
	)

	for range 50 {
		group.Go(func() {
			_ = scope.AddFinalizer(func() error {
				mu.Lock()
				count++
				mu.Unlock()

				return nil
			})
		})
	}

	group.Wait()

	if err := scope.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	if count != 50 {
		t.Errorf("%d finalizers ran, want 50", count)
	}
}
