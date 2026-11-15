// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package functionsfx

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"
)

// DefaultParallelism bounds how many tasks AllPar runs at once when no limit
// is given.
const DefaultParallelism = 8

// Map transforms the value of a task. It pairs with map in task.ts.
func Map[T, U any](t Task[T], f func(T) U) Task[U] {
	return func(ctx context.Context) (U, error) {
		value, err := t(ctx)
		if err != nil {
			var zero U

			return zero, err
		}

		return f(value), nil
	}
}

// Then chains a task with a function that returns the next one. It pairs with
// flatMap and flatMapW: Go has one error type, so the two are one function,
// and the requirements the TypeScript types widen are the context both tasks
// share.
func Then[T, U any](t Task[T], f func(T) Task[U]) Task[U] {
	return func(ctx context.Context) (U, error) {
		value, err := t(ctx)
		if err != nil {
			var zero U

			return zero, err
		}

		return f(value)(ctx)
	}
}

// All runs the tasks one after another and collects their values, in order. It
// stops at the first failure and runs no later task. It pairs with all.
func All[T any](tasks []Task[T]) Task[[]T] {
	return func(ctx context.Context) ([]T, error) {
		values := make([]T, 0, len(tasks))

		for _, t := range tasks {
			value, err := t(ctx)
			if err != nil {
				return nil, err
			}

			values = append(values, value)
		}

		return values, nil
	}
}

type parallelConfig struct {
	limit int
}

// ParallelOption sets one option of AllPar.
type ParallelOption func(*parallelConfig)

// WithParallelism bounds how many tasks AllPar runs at once. A limit below one
// is ignored and DefaultParallelism applies.
func WithParallelism(limit int) ParallelOption {
	return func(config *parallelConfig) {
		if limit > 0 {
			config.limit = limit
		}
	}
}

// AllPar runs the tasks at the same time, at most DefaultParallelism of them
// unless WithParallelism says otherwise, and collects their values in the order
// of the tasks. It pairs with allPar, with two differences. It is bounded. And
// at the first failure it cancels the context the others run on and starts no
// more, so it answers the first failure in time where allPar answers the first
// in order. A task that panics fails the whole with an error.
func AllPar[T any](tasks []Task[T], options ...ParallelOption) Task[[]T] {
	config := parallelConfig{limit: DefaultParallelism}
	for _, option := range options {
		option(&config)
	}

	return func(parent context.Context) ([]T, error) {
		ctx, cancel := context.WithCancel(parent)
		defer cancel()

		values := make([]T, len(tasks))
		slots := make(chan struct{}, config.limit)

		var (
			group    sync.WaitGroup
			failure  error
			failedMu sync.Mutex
		)

		fail := func(err error) {
			failedMu.Lock()
			defer failedMu.Unlock()

			if failure == nil {
				failure = err

				cancel()
			}
		}

	start:
		for index, t := range tasks {
			select {
			case slots <- struct{}{}:
			case <-ctx.Done():
				break start
			}

			// A slot and a cancelled context can be ready together, and select picks
			// at random: look again, so no task starts after a failure is seen.
			if ctx.Err() != nil {
				<-slots

				break start
			}

			group.Go(func() {
				defer func() { <-slots }()

				value, err := runGuarded(ctx, index, t)
				if err != nil {
					fail(err)

					return
				}

				values[index] = value
			})
		}

		group.Wait()

		if failure != nil {
			return nil, failure
		}

		// No task failed, so the loop stopped because the caller's context ended.
		if err := parent.Err(); err != nil {
			return nil, fmt.Errorf("all in parallel: %w", err)
		}

		return values, nil
	}
}

// runGuarded runs a task and turns a panic into an error, so one task cannot
// take the process down from its goroutine.
func runGuarded[T any](ctx context.Context, index int, t Task[T]) (value T, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("task %d panicked: %v", index, recovered) //nolint:err113
		}
	}()

	return t(ctx)
}

// Validate returns a function that checks a value with the predicate and gives
// a task that answers the value, or a ValidationError with the message. It
// pairs with validate.
func Validate[T any](predicate func(T) bool, message string) func(T) Task[T] {
	return func(value T) Task[T] {
		if predicate(value) {
			return Succeed(value)
		}

		return Fail[T](NewValidationError(message))
	}
}

// WithTimeout ends a task that runs longer than timeout, or whose context ends,
// with an AbortError. A timeout of zero adds no deadline and the context alone
// ends it. It pairs with withAbort: the messages are the same, and the signal is
// the context. The task runs on a context that ends at the deadline, so a task
// that honors its context stops; one that does not is abandoned and finishes on
// its own, as the answer of withAbort leaves it.
func WithTimeout[T any](t Task[T], timeout time.Duration) Task[T] {
	return func(parent context.Context) (T, error) {
		var zero T

		if parent.Err() != nil {
			return zero, NewAbortError("Operation was already aborted")
		}

		var (
			ctx    context.Context
			cancel context.CancelFunc
		)

		if timeout > 0 {
			ctx, cancel = context.WithTimeout(parent, timeout)
		} else {
			ctx, cancel = context.WithCancel(parent)
		}

		defer cancel()

		type answer struct {
			err   error
			value T
		}

		done := make(chan answer, 1)

		go func() {
			value, err := runGuarded(ctx, 0, t)
			done <- answer{value: value, err: err}
		}()

		select {
		case result := <-done:
			if result.err != nil && ctx.Err() != nil && isContextError(result.err) {
				return zero, abortOf(parent, timeout)
			}

			return result.value, result.err
		case <-ctx.Done():
			return zero, abortOf(parent, timeout)
		}
	}
}

func isContextError(err error) bool {
	return errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded)
}

// abortOf is the error of a task that ended because its context did: the
// caller's context, or the deadline of WithTimeout.
func abortOf(parent context.Context, timeout time.Duration) error {
	if parent.Err() != nil {
		return NewAbortError("Operation aborted")
	}

	return NewAbortError(fmt.Sprintf("Operation timed out after %dms", timeout.Milliseconds()))
}

// WithLogging logs the start of a task and how it ended, under the label. It
// pairs with withLogging, whose logger travels in the context: Go passes it as
// an argument, a standard library logger that logfx also satisfies.
func WithLogging[T any](t Task[T], logger *slog.Logger, label string) Task[T] {
	return func(ctx context.Context) (T, error) {
		logger.InfoContext(ctx, "["+label+"] started")

		value, err := t(ctx)
		if err != nil {
			logger.ErrorContext(ctx, "["+label+"] failed", slog.String("error", err.Error()))

			return value, err
		}

		logger.InfoContext(ctx, "["+label+"] completed")

		return value, nil
	}
}
