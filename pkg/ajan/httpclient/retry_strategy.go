package httpclient

import (
	"math"
	"math/rand/v2"
	"time"
)

const (
	DefaultMaxAttempts     = 3
	DefaultInitialInterval = 100 * time.Millisecond
	DefaultMaxInterval     = 10 * time.Second
	DefaultMultiplier      = 2.0
	DefaultRandomFactor    = 0.1
)

type RetryStrategy struct {
	Config *RetryStrategyConfig
}

// NewRetryStrategy creates a new retry strategy with the specified parameters.
func NewRetryStrategy(config *RetryStrategyConfig) *RetryStrategy {
	return &RetryStrategy{
		Config: config,
	}
}

func (r *RetryStrategy) NextBackoff(attempt uint) time.Duration {
	if attempt >= r.Config.MaxAttempts {
		return 0
	}

	// Calculate exponential backoff
	backoff := float64(r.Config.InitialInterval) * math.Pow(r.Config.Multiplier, float64(attempt))

	// Apply random factor using fast math/rand (crypto security not needed for jitter)
	if r.Config.RandomFactor > 0 {
		random := 1 + r.Config.RandomFactor*(2*rand.Float64()-1) //nolint:gosec
		backoff *= random
	}

	// Ensure we don't exceed max interval
	if backoff > float64(r.Config.MaxInterval) {
		backoff = float64(r.Config.MaxInterval)
	}

	return time.Duration(backoff)
}
