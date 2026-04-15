package httpclient

import (
	"crypto/tls"
	"net/http"
	"time"
)

// Client is a drop-in replacement for http.Client with built-in circuit breaker and retry mechanisms.
type Client struct {
	*http.Client

	Config          *Config
	Transport       *ResilientTransport
	TLSClientConfig *tls.Config
	innerTransport  http.RoundTripper
	timeout         time.Duration
}

// NewClient creates a new http client with the specified circuit breaker and retry strategy.
func NewClient(options ...NewClientOption) *Client {
	client := &Client{
		Client:          nil,
		Config:          defaultConfig(),
		Transport:       nil,
		TLSClientConfig: nil,
		innerTransport:  nil,
		timeout:         0,
	}

	for _, option := range options {
		option(client)
	}

	if client.Transport == nil {
		client.Transport = buildResilientTransport(client)
	}

	client.Client = &http.Client{ //nolint:exhaustruct
		Transport: client.Transport,
		Timeout:   client.timeout,
	}

	return client
}

// defaultConfig returns the default httpclient configuration.
func defaultConfig() *Config {
	return &Config{
		CircuitBreaker: CircuitBreakerConfig{
			Enabled:               true,
			FailureThreshold:      DefaultFailureThreshold,
			ResetTimeout:          DefaultResetTimeout,
			HalfOpenSuccessNeeded: DefaultHalfOpenSuccess,
		},
		RetryStrategy: RetryStrategyConfig{
			Enabled:         true,
			MaxAttempts:     DefaultMaxAttempts,
			InitialInterval: DefaultInitialInterval,
			MaxInterval:     DefaultMaxInterval,
			Multiplier:      DefaultMultiplier,
			RandomFactor:    DefaultRandomFactor,
		},
		Transport:            TransportConfig{}, //nolint:exhaustruct
		ServerErrorThreshold: DefaultServerErrorThreshold,
	}
}

// buildResilientTransport creates a ResilientTransport from the client configuration.
func buildResilientTransport(client *Client) *ResilientTransport {
	var transport http.RoundTripper

	if client.innerTransport != nil {
		transport = client.innerTransport
	} else {
		transport = cloneDefaultTransport(client.TLSClientConfig)
	}

	return NewResilientTransport(transport, client.Config)
}

// cloneDefaultTransport creates a cloned copy of the default HTTP transport.
func cloneDefaultTransport(tlsConfig *tls.Config) http.RoundTripper {
	defaultTransport, transportOk := http.DefaultTransport.(*http.Transport)
	if !transportOk {
		return http.DefaultTransport
	}

	clonedTransport := defaultTransport.Clone()

	if tlsConfig != nil {
		clonedTransport.TLSClientConfig = tlsConfig
	}

	return clonedTransport
}
