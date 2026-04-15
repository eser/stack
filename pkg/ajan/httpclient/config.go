package httpclient

import (
	"time"
)

type Config struct {
	CircuitBreaker CircuitBreakerConfig `conf:"circuit_breaker"`
	RetryStrategy  RetryStrategyConfig  `conf:"retry_strategy"`
	Transport      TransportConfig      `conf:"transport"`

	ServerErrorThreshold int `conf:"server_error_threshold" default:"500"`
}

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

type TransportConfig struct {
	MaxIdleConns        int           `conf:"max_idle_conns"          default:"200"`
	MaxIdleConnsPerHost int           `conf:"max_idle_conns_per_host" default:"100"`
	MaxConnsPerHost     int           `conf:"max_conns_per_host"      default:"0"`
	IdleConnTimeout     time.Duration `conf:"idle_conn_timeout"       default:"60s"`
}
