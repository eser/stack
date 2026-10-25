// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package resilience

import "time"

type CircuitBreakerConfig struct {
	Enabled               bool          `conf:"enabled"                  default:"true"`
	FailureThreshold      uint          `conf:"failure_threshold"        default:"5"`
	ResetTimeout          time.Duration `conf:"reset_timeout"            default:"10s"`
	HalfOpenSuccessNeeded uint          `conf:"half_open_success_needed" default:"2"`
}

type RetryStrategyConfig struct {
	Enabled         bool          `conf:"enabled"          default:"true"`
	MaxAttempts     uint          `conf:"max_attempts"     default:"3"`
	InitialInterval time.Duration `conf:"initial_interval" default:"100ms"`
	MaxInterval     time.Duration `conf:"max_interval"     default:"10s"`
	Multiplier      float64       `conf:"multiplier"       default:"2"`
	RandomFactor    float64       `conf:"random_factor"    default:"0.1"`
}
