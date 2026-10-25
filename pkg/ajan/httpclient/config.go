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

type TransportConfig struct {
	MaxIdleConns        int           `conf:"max_idle_conns"          default:"200"`
	MaxIdleConnsPerHost int           `conf:"max_idle_conns_per_host" default:"100"`
	MaxConnsPerHost     int           `conf:"max_conns_per_host"      default:"0"`
	IdleConnTimeout     time.Duration `conf:"idle_conn_timeout"       default:"60s"`
}
