package connfx

import (
	"errors"
	"time"
)

var (
	ErrInvalidConnectionBehavior = errors.New("invalid connection behavior")
	ErrInvalidConnectionProtocol = errors.New("invalid connection protocol")
	ErrInvalidDSN                = errors.New("invalid DSN")
	ErrInvalidURL                = errors.New("invalid URL")
	ErrInvalidConfigType         = errors.New("invalid config type")
)

// Config represents the main configuration for connfx.
type Config struct {
	Targets map[string]ConfigTarget `conf:"targets"`
}

// ConfigTarget represents the configuration data for a connection.
type ConfigTarget struct {
	Properties map[string]any `conf:"properties"`

	Protocol string `conf:"protocol"` // e.g., "postgres", "redis", "http"
	DSN      string `conf:"dsn"`
	URL      string `conf:"url"`
	Host     string `conf:"host"`
	CertFile string `conf:"cert_file"`
	KeyFile  string `conf:"key_file"`
	CAFile   string `conf:"ca_file"`

	// External credential management
	Port            int           `conf:"port"`
	MaxOpenConns    int           `conf:"max_open_conns"     default:"10"`
	MaxConnLifetime time.Duration `conf:"max_conn_lifetime"  default:"1h"`
	MaxIdleConns    int           `conf:"max_idle_conns"     default:"5"`
	MaxConnIdleTime time.Duration `conf:"max_conn_idle_time" default:"1m"`
	Timeout         time.Duration `conf:"timeout"`

	// Authentication and security
	TLS           bool `conf:"tls"`
	TLSSkipVerify bool `conf:"tls_skip_verify"`
}
