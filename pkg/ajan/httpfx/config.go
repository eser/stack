package httpfx

import (
	"time"
)

type Config struct {
	APIKeys map[string]string `conf:"api_keys"`
	Addr    string            `conf:"addr"     default:":8080"`

	CertString        string        `conf:"cert_string"`
	KeyString         string        `conf:"key_string"`
	SkipAuthPaths     []string      `conf:"skip_auth_paths"     default:"/health,/metrics,/docs,/openapi.json"`
	ReadHeaderTimeout time.Duration `conf:"read_header_timeout" default:"5s"`
	// C10K optimized timeouts: allow longer processing for high concurrency
	ReadTimeout  time.Duration `conf:"read_timeout"        default:"30s"`  //nolint:tagalign // golines conflict
	WriteTimeout time.Duration `conf:"write_timeout"       default:"30s"`  //nolint:tagalign // golines conflict
	IdleTimeout  time.Duration `conf:"idle_timeout"        default:"300s"` //nolint:tagalign // golines conflict

	InitializationTimeout   time.Duration `conf:"init_timeout"     default:"25s"`
	GracefulShutdownTimeout time.Duration `conf:"shutdown_timeout" default:"5s"`

	// Security configuration
	RateLimitRequests int   `conf:"rate_limit_requests" default:"3600"`
	MaxRequestSizeMB  int64 `conf:"max_request_size_mb" default:"50"`

	SelfSigned bool `conf:"self_signed" default:"false"`

	HealthCheckEnabled bool `conf:"health_check" default:"true"`
	OpenAPIEnabled     bool `conf:"openapi"      default:"true"`
	ProfilingEnabled   bool `conf:"profiling"    default:"false"`

	// Authentication configuration
	AuthEnabled bool `conf:"auth_enabled" default:"false"`

	ExposeInternalErrors bool `conf:"expose_internal_errors" default:"false"`

	// High-performance connection settings (see: goperf.dev/02-networking/10k-connections/)
	// MaxHeaderBytes controls the maximum number of bytes the server will read parsing the request header
	MaxHeaderBytes int `conf:"max_header_bytes" default:"1048576"` // 1MB default

	// MaxConnections limits concurrent connections. Prevents resource exhaustion under load.
	// C10K optimized: 15000 allows headroom above 10K concurrent connections
	MaxConnections int `conf:"max_connections" default:"15000"`

	// TCPKeepAlive enables TCP keep-alive on accepted connections
	TCPKeepAlive bool `conf:"tcp_keep_alive" default:"true"`

	// TCPKeepAlivePeriod sets the keep-alive period for TCP connections
	TCPKeepAlivePeriod time.Duration `conf:"tcp_keep_alive_period" default:"30s"`

	// TCPNoDelay disables Nagle's algorithm for lower latency (TCP_NODELAY)
	TCPNoDelay bool `conf:"tcp_no_delay" default:"true"`
}
