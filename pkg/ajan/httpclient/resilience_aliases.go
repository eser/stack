// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package httpclient

import "github.com/eser/stack/pkg/ajan/httpclient/resilience"

// The circuit breaker and the retry strategy live in the resilience
// subpackage, which does not import net/http, so the wasip1 build of the ajan
// bridge retries and breaks circuits the same way without linking it. These
// names keep the httpclient API as it was.

type (
	CircuitBreakerConfig = resilience.CircuitBreakerConfig
	RetryStrategyConfig  = resilience.RetryStrategyConfig
	CircuitBreaker       = resilience.CircuitBreaker
	RetryStrategy        = resilience.RetryStrategy
	CircuitState         = resilience.CircuitState
)

const (
	StateClosed   = resilience.StateClosed
	StateHalfOpen = resilience.StateHalfOpen
	StateOpen     = resilience.StateOpen

	DefaultMaxAttempts     = resilience.DefaultMaxAttempts
	DefaultInitialInterval = resilience.DefaultInitialInterval
	DefaultMaxInterval     = resilience.DefaultMaxInterval
	DefaultMultiplier      = resilience.DefaultMultiplier
	DefaultRandomFactor    = resilience.DefaultRandomFactor
)

// NewCircuitBreaker creates a circuit breaker; see resilience.NewCircuitBreaker.
func NewCircuitBreaker(config *CircuitBreakerConfig) *CircuitBreaker {
	return resilience.NewCircuitBreaker(config)
}

// NewRetryStrategy creates a retry strategy; see resilience.NewRetryStrategy.
func NewRetryStrategy(config *RetryStrategyConfig) *RetryStrategy {
	return resilience.NewRetryStrategy(config)
}
