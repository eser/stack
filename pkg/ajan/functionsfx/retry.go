// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package functionsfx

import (
	"context"
	"errors"
	"math"
	"time"

	"github.com/eser/stack/pkg/ajan/httpclient/resilience"
)

// ErrNoAttempts is the error of a retry that was asked for no attempt. The
// message is the one retry has in resources.ts.
var ErrNoAttempts = errors.New("No attempts made") //nolint:staticcheck // the text pairs with the TypeScript message

// DefaultBackoffAttempts is how many attempts RetryWithBackoff makes when its
// Backoff names none.
const DefaultBackoffAttempts = 3

// Sleeper waits for d, or until ctx ends, and answers the error of the context
// when it ended first.
type Sleeper func(ctx context.Context, d time.Duration) error

// sleepFor is the Sleeper a retry uses unless WithSleeper replaces it.
func sleepFor(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return ctx.Err()
	}

	timer := time.NewTimer(d)
	defer timer.Stop()

	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err() //nolint:wrapcheck // the caller reads the context error as it is
	}
}

type retryConfig struct {
	sleep Sleeper
}

// RetryOption sets one option of Retry or RetryWithBackoff.
type RetryOption func(*retryConfig)

// WithSleeper replaces the wait between attempts, which a test uses to record
// the delays instead of waiting for them.
func WithSleeper(sleep Sleeper) RetryOption {
	return func(config *retryConfig) {
		if sleep != nil {
			config.sleep = sleep
		}
	}
}

func retryConfigOf(options []RetryOption) retryConfig {
	config := retryConfig{sleep: sleepFor}
	for _, option := range options {
		option(&config)
	}

	return config
}

// Retry runs the task up to attempts times, waiting delay between a failure and
// the next attempt, and answers the first success or the last failure. It pairs
// with retry and withRetry: a Task is the function retry takes, so Go has one of
// the two. Fewer than one attempt is ErrNoAttempts.
func Retry[T any](t Task[T], attempts int, delay time.Duration, options ...RetryOption) Task[T] {
	config := retryConfigOf(options)

	return retryLoop(t, attempts, config, func(int) time.Duration { return delay })
}

// Backoff describes the waits of RetryWithBackoff. It pairs with the options of
// retryWithBackoff.
type Backoff struct {
	// MaxAttempts counts the attempts, the first one included. Zero means
	// DefaultBackoffAttempts; a negative number means none.
	MaxAttempts int
	// InitialDelay is the wait after the first failure.
	InitialDelay time.Duration
	// MaxDelay caps a wait. Zero means no cap.
	MaxDelay time.Duration
	// Factor multiplies the wait after each failure. Zero means 2.
	Factor float64
}

// RetryWithBackoff runs the task like Retry, with a wait that grows by Factor
// after each failure, up to MaxDelay. The delays come from RetryStrategy of
// httpclient/resilience with no jitter, so they are exact. It pairs with
// retryWithBackoff, and differs from it in one case: the wait after the first
// failure is capped by MaxDelay here, and not there, so an InitialDelay above
// MaxDelay waits MaxDelay in Go and InitialDelay in TypeScript.
func RetryWithBackoff[T any](t Task[T], backoff Backoff, options ...RetryOption) Task[T] {
	config := retryConfigOf(options)

	attempts := backoff.MaxAttempts
	if attempts == 0 {
		attempts = DefaultBackoffAttempts
	}

	factor := backoff.Factor
	if factor == 0 {
		factor = 2
	}

	maxDelay := backoff.MaxDelay
	if maxDelay <= 0 {
		maxDelay = time.Duration(math.MaxInt64)
	}

	var strategy *resilience.RetryStrategy
	if attempts > 0 {
		strategy = resilience.NewRetryStrategy(&resilience.RetryStrategyConfig{
			Enabled:         true,
			MaxAttempts:     uint(attempts), //nolint:gosec // G115: attempts is positive here
			InitialInterval: backoff.InitialDelay,
			MaxInterval:     maxDelay,
			Multiplier:      factor,
			RandomFactor:    0,
		})
	}

	return retryLoop(t, attempts, config, func(failed int) time.Duration {
		return strategy.NextBackoff(uint(failed)) //nolint:gosec // G115: failed is not negative
	})
}

// retryLoop runs t up to attempts times. delayAfter(i) is the wait after the
// i-th failure, counted from zero.
func retryLoop[T any](t Task[T], attempts int, config retryConfig, delayAfter func(failed int) time.Duration) Task[T] {
	return func(ctx context.Context) (T, error) {
		var (
			zero  T
			value T
			err   = ErrNoAttempts
		)

		for attempt := range attempts {
			if ctxErr := ctx.Err(); ctxErr != nil {
				return zero, ctxErr //nolint:wrapcheck // the caller reads the context error as it is
			}

			value, err = t(ctx)
			if err == nil {
				return value, nil
			}

			if attempt < attempts-1 {
				if sleepErr := config.sleep(ctx, delayAfter(attempt)); sleepErr != nil {
					return zero, sleepErr
				}
			}
		}

		return zero, err
	}
}
