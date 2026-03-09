package connfx

import (
	"bytes"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"maps"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"github.com/eser/stack/apps/services/pkg/eser-go/httpclient"
)

const (
	DefaultHTTPTimeout = 30 * time.Second
	HealthCheckTimeout = 2 * time.Second

	// Circuit breaker defaults.
	DefaultCircuitBreakerFailureThreshold     = 5
	DefaultCircuitBreakerResetTimeout         = 10 * time.Second
	DefaultCircuitBreakerHalfOpenSuccessCount = 2

	// Retry strategy defaults.
	DefaultRetryMaxAttempts     = 3
	DefaultRetryInitialInterval = 100 * time.Millisecond
	DefaultRetryMaxInterval     = 10 * time.Second
	DefaultRetryMultiplier      = 2.0
	DefaultRetryRandomFactor    = 0.1

	// HTTP error threshold.
	DefaultServerErrorThreshold = 500
)

var (
	ErrFailedToCreateHTTPClient      = errors.New("failed to create HTTP client")
	ErrFailedToHealthCheckHTTP       = errors.New("failed to health check HTTP endpoint")
	ErrInvalidConfigTypeHTTP         = errors.New("invalid config type for HTTP connection")
	ErrUnsupportedBodyType           = errors.New("unsupported body type")
	ErrFailedToCreateRequest         = errors.New("failed to create HTTP request")
	ErrFailedToLoadCertificate       = errors.New("failed to load client certificate")
	ErrFailedToCreateHealthCheckReq  = errors.New("failed to create health check request")
	ErrFailedToPerformHealthCheckReq = errors.New("failed to perform health check request")
	ErrFailedToCreateGetRequest      = errors.New("failed to create GET request")
	ErrFailedToPerformGetRequest     = errors.New("failed to perform GET request")
	ErrFailedToCreateResilientClient = errors.New("failed to create resilient HTTP client")
)

// HTTPConnection represents an HTTP API connection with resilience features.
type HTTPConnection struct {
	lastHealth time.Time
	client     *httpclient.Client
	headers    map[string]string
	protocol   string
	baseURL    string
	state      int32 // atomic field for connection state
}

// HTTPConnectionFactory creates HTTP connections.
type HTTPConnectionFactory struct {
	protocol string
}

// NewHTTPConnectionFactory creates a new HTTP connection factory.
func NewHTTPConnectionFactory(protocol string) *HTTPConnectionFactory {
	return &HTTPConnectionFactory{
		protocol: protocol,
	}
}

func (f *HTTPConnectionFactory) CreateConnection( //nolint:ireturn
	ctx context.Context,
	config *ConfigTarget,
) (Connection, error) {
	// Create resilient HTTP client with configuration
	client, headers, err := f.buildResilientHTTPClient(config)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrFailedToCreateHTTPClient, err)
	}

	baseURL := config.URL

	// Initial health check
	conn := &HTTPConnection{
		protocol:   f.protocol,
		client:     client,
		baseURL:    baseURL,
		headers:    headers,
		state:      int32(ConnectionStateConnected),
		lastHealth: time.Time{},
	}

	// Perform initial health check
	status := conn.HealthCheck(ctx)
	if status.State == ConnectionStateError {
		return nil, fmt.Errorf("%w: %w", ErrFailedToHealthCheckHTTP, status.Error)
	}

	return conn, nil
}

func (f *HTTPConnectionFactory) GetProtocol() string {
	return f.protocol
}

func (f *HTTPConnectionFactory) buildResilientHTTPClient( //nolint:cyclop
	config *ConfigTarget,
) (*httpclient.Client, map[string]string, error) {
	// Create resilient HTTP client configuration
	clientConfig := f.buildClientConfig(config)

	// Create resilient client with custom transport
	clientOptions := []httpclient.NewClientOption{
		httpclient.WithConfig(clientConfig),
	}

	if config.TLS || config.TLSSkipVerify {
		tlsConfig := &tls.Config{ //nolint:exhaustruct
			InsecureSkipVerify: config.TLSSkipVerify, //nolint:gosec
		}

		// Load client certificates if provided
		if config.CertFile != "" && config.KeyFile != "" {
			cert, err := tls.LoadX509KeyPair(config.CertFile, config.KeyFile)
			if err != nil {
				return nil, nil, fmt.Errorf(
					"%w (cert_file=%q, key_file=%q): %w",
					ErrFailedToLoadCertificate,
					config.CertFile,
					config.KeyFile,
					err,
				)
			}

			tlsConfig.Certificates = []tls.Certificate{cert}
		}

		clientOptions = append(clientOptions, httpclient.WithTLSClientConfig(tlsConfig))
	}

	client := httpclient.NewClient(clientOptions...)

	// Set timeout
	if config.Timeout > 0 {
		client.Timeout = config.Timeout
	} else {
		client.Timeout = DefaultHTTPTimeout
	}

	// Build default headers
	headers := make(map[string]string)
	headers["User-Agent"] = "connfx-http-client/1.0"

	// Add custom headers from properties
	if config.Properties != nil {
		// Try map[string]any first (for runtime configuration)
		if customHeaders, ok := config.Properties["headers"].(map[string]any); ok {
			for k, v := range customHeaders {
				if strVal, ok := v.(string); ok {
					headers[k] = strVal
				}
			}
		} else if customHeaders, ok := config.Properties["headers"].(map[string]string); ok {
			// Try map[string]string (for literal configuration)
			maps.Copy(headers, customHeaders)
		}
	}

	return client, headers, nil
}

func (f *HTTPConnectionFactory) buildClientConfig(config *ConfigTarget) *httpclient.Config {
	clientConfig := &httpclient.Config{
		CircuitBreaker: httpclient.CircuitBreakerConfig{
			Enabled:               true,
			FailureThreshold:      DefaultCircuitBreakerFailureThreshold,
			ResetTimeout:          DefaultCircuitBreakerResetTimeout,
			HalfOpenSuccessNeeded: DefaultCircuitBreakerHalfOpenSuccessCount,
		},
		RetryStrategy: httpclient.RetryStrategyConfig{
			Enabled:         true,
			MaxAttempts:     DefaultRetryMaxAttempts,
			InitialInterval: DefaultRetryInitialInterval,
			MaxInterval:     DefaultRetryMaxInterval,
			Multiplier:      DefaultRetryMultiplier,
			RandomFactor:    DefaultRetryRandomFactor,
		},
		Transport:            httpclient.TransportConfig{}, //nolint:exhaustruct
		ServerErrorThreshold: DefaultServerErrorThreshold,
	}

	if config.Properties != nil {
		f.applyCircuitBreakerConfig(clientConfig, config.Properties)
		f.applyRetryStrategyConfig(clientConfig, config.Properties)
		f.applyServerErrorThreshold(clientConfig, config.Properties)
	}

	return clientConfig
}

func (f *HTTPConnectionFactory) applyCircuitBreakerConfig(
	clientConfig *httpclient.Config,
	properties map[string]any,
) {
	cbConfig, ok := properties["circuit_breaker"].(map[string]any)
	if !ok {
		return
	}

	if enabled, ok := cbConfig["enabled"].(bool); ok {
		clientConfig.CircuitBreaker.Enabled = enabled
	}

	if threshold, ok := cbConfig["failure_threshold"].(int); ok && threshold >= 0 {
		clientConfig.CircuitBreaker.FailureThreshold = uint(threshold)
	}

	if timeout, ok := cbConfig["reset_timeout"].(time.Duration); ok {
		clientConfig.CircuitBreaker.ResetTimeout = timeout
	}

	if success, ok := cbConfig["half_open_success_needed"].(int); ok && success >= 0 {
		clientConfig.CircuitBreaker.HalfOpenSuccessNeeded = uint(success)
	}
}

func (f *HTTPConnectionFactory) applyRetryStrategyConfig(
	clientConfig *httpclient.Config,
	properties map[string]any,
) {
	retryConfig, ok := properties["retry_strategy"].(map[string]any)
	if !ok {
		return
	}

	if enabled, ok := retryConfig["enabled"].(bool); ok {
		clientConfig.RetryStrategy.Enabled = enabled
	}

	if maxAttempts, ok := retryConfig["max_attempts"].(int); ok && maxAttempts >= 0 {
		clientConfig.RetryStrategy.MaxAttempts = uint(maxAttempts)
	}

	if initialInterval, ok := retryConfig["initial_interval"].(time.Duration); ok {
		clientConfig.RetryStrategy.InitialInterval = initialInterval
	}

	if maxInterval, ok := retryConfig["max_interval"].(time.Duration); ok {
		clientConfig.RetryStrategy.MaxInterval = maxInterval
	}

	if multiplier, ok := retryConfig["multiplier"].(float64); ok {
		clientConfig.RetryStrategy.Multiplier = multiplier
	}

	if randomFactor, ok := retryConfig["random_factor"].(float64); ok {
		clientConfig.RetryStrategy.RandomFactor = randomFactor
	}
}

func (f *HTTPConnectionFactory) applyServerErrorThreshold(
	clientConfig *httpclient.Config,
	properties map[string]any,
) {
	if threshold, ok := properties["server_error_threshold"].(int); ok {
		clientConfig.ServerErrorThreshold = threshold
	}
}

// Connection interface implementation

func (c *HTTPConnection) GetBehaviors() []ConnectionBehavior {
	return []ConnectionBehavior{ConnectionBehaviorStateless}
}

func (c *HTTPConnection) GetCapabilities() []ConnectionCapability {
	return []ConnectionCapability{}
}

func (c *HTTPConnection) GetProtocol() string {
	return c.protocol
}

func (c *HTTPConnection) GetState() ConnectionState {
	state := atomic.LoadInt32(&c.state)

	return ConnectionState(state)
}

func (c *HTTPConnection) HealthCheck(
	ctx context.Context,
) *HealthStatus {
	start := time.Now()
	status := &HealthStatus{ //nolint:exhaustruct
		Timestamp: start,
	}

	// Create and perform health check request
	resp, err := c.performHealthCheckRequest(ctx)
	status.Latency = time.Since(start)

	if err != nil {
		atomic.StoreInt32(&c.state, int32(ConnectionStateError))
		status.State = ConnectionStateError
		status.Error = err
		status.Message = fmt.Sprintf("Health check failed: %v", err)

		return status
	}

	defer func() {
		_ = resp.Body.Close() // Ignore close error for health check
	}()

	// Determine health state based on HTTP response status
	c.determineHealthState(resp, status, ctx, start)
	c.lastHealth = start

	return status
}

func (c *HTTPConnection) Close(ctx context.Context) error {
	atomic.StoreInt32(&c.state, int32(ConnectionStateDisconnected))
	// Resilient HTTP clients handle cleanup internally
	if transport, ok := c.client.Transport.Transport.(*http.Transport); ok {
		transport.CloseIdleConnections()
	}

	return nil
}

func (c *HTTPConnection) GetRawConnection() any {
	return c.client
}

// Additional HTTP-specific methods

// GetClient returns the underlying resilient HTTP client.
func (c *HTTPConnection) GetClient() *httpclient.Client {
	return c.client
}

// GetStandardClient returns the standard HTTP client from the resilient client.
func (c *HTTPConnection) GetStandardClient() *http.Client {
	return c.client.Client
}

// GetBaseURL returns the base URL for this connection.
func (c *HTTPConnection) GetBaseURL() string {
	return c.baseURL
}

// GetHeaders returns the default headers for this connection.
func (c *HTTPConnection) GetHeaders() map[string]string {
	headers := make(map[string]string)
	maps.Copy(headers, c.headers)

	return headers
}

// GetCircuitBreakerState returns the current state of the circuit breaker.
func (c *HTTPConnection) GetCircuitBreakerState() string {
	if c.client.Transport != nil && c.client.Transport.CircuitBreaker != nil {
		return c.client.Transport.CircuitBreaker.State().String()
	}

	return "unknown"
}

// NewRequest creates a new HTTP request with the connection's default headers.
func (c *HTTPConnection) NewRequest(
	ctx context.Context,
	method string,
	path string,
	body any,
) (*http.Request, error) {
	url := c.baseURL

	if path != "" {
		if path[0] != '/' {
			url += "/"
		}

		url += path
	}

	var req *http.Request

	var err error

	// Handle different body types
	switch v := body.(type) { //nolint:varnamelen
	case nil:
		req, err = http.NewRequestWithContext(ctx, method, url, nil)
	case string:
		req, err = http.NewRequestWithContext(ctx, method, url, strings.NewReader(v))
	case []byte:
		req, err = http.NewRequestWithContext(ctx, method, url, bytes.NewReader(v))
	case io.Reader:
		req, err = http.NewRequestWithContext(ctx, method, url, v)
	default:
		return nil, fmt.Errorf("%w: %T", ErrUnsupportedBodyType, body)
	}

	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrFailedToCreateRequest, err)
	}

	// Add default headers
	for k, v := range c.headers {
		req.Header.Set(k, v)
	}

	return req, nil
}

func (c *HTTPConnection) performHealthCheckRequest(ctx context.Context) (*http.Response, error) {
	// Create health check request (HEAD request to base URL)
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, c.baseURL, nil)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrFailedToCreateHealthCheckReq, err)
	}

	// Add default headers
	for k, v := range c.headers {
		req.Header.Set(k, v)
	}

	// Use the resilient client for health checks
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrFailedToPerformHealthCheckReq, err)
	}

	return resp, nil
}

func (c *HTTPConnection) determineHealthState(
	resp *http.Response,
	status *HealthStatus,
	ctx context.Context,
	start time.Time,
) {
	// Try GET request if HEAD fails with 405 (Method Not Allowed)
	if resp.StatusCode == http.StatusMethodNotAllowed {
		if getStatus := c.tryGetRequest(ctx, start); getStatus != nil {
			*status = *getStatus

			return
		}
	}

	// Use the common status setting logic
	c.setStatusFromResponse(resp.StatusCode, status, "HEAD")
}

// tryGetRequest attempts a GET request when HEAD fails with 405.
func (c *HTTPConnection) tryGetRequest(ctx context.Context, start time.Time) *HealthStatus {
	getResp, err := c.performGetRequest(ctx)
	if err != nil || getResp == nil {
		return nil
	}

	defer func() {
		_ = getResp.Body.Close() // Ignore close error for health check
	}()

	// Apply same logic as main health check for GET response
	status := &HealthStatus{ //nolint:exhaustruct
		Timestamp: start,
		Latency:   time.Since(start),
	}

	c.setStatusFromResponse(getResp.StatusCode, status, "GET fallback")
	c.lastHealth = start

	return status
}

func (c *HTTPConnection) performGetRequest(ctx context.Context) (*http.Response, error) {
	getReq, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL, nil)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrFailedToCreateGetRequest, err)
	}

	for k, v := range c.headers {
		getReq.Header.Set(k, v)
	}

	resp, err := c.client.Do(getReq)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrFailedToPerformGetRequest, err)
	}

	return resp, nil
}

func (c *HTTPConnection) setStatusFromResponse(
	statusCode int,
	status *HealthStatus,
	context string,
) {
	switch {
	case statusCode >= 200 && statusCode < 300:
		// 2xx responses indicate service is ready
		atomic.StoreInt32(&c.state, int32(ConnectionStateReady))
		status.State = ConnectionStateReady
		status.Message = fmt.Sprintf(
			"HTTP service is live and ready (%s, status=%d)",
			context,
			statusCode,
		)
	case statusCode == http.StatusTooManyRequests:
		// 429 means service is live but not ready (overloaded)
		atomic.StoreInt32(&c.state, int32(ConnectionStateLive))
		status.State = ConnectionStateLive
		status.Message = fmt.Sprintf(
			"HTTP service is live but overloaded (%s, status=%d)",
			context,
			statusCode,
		)
	case statusCode == http.StatusServiceUnavailable:
		// 503 means service is connected but not live
		atomic.StoreInt32(&c.state, int32(ConnectionStateConnected))
		status.State = ConnectionStateConnected
		status.Message = fmt.Sprintf(
			"HTTP service connected but unavailable (%s, status=%d)",
			context,
			statusCode,
		)
	case statusCode >= 400 && statusCode < 500:
		// 4xx errors indicate connected but configuration issues
		atomic.StoreInt32(&c.state, int32(ConnectionStateConnected))
		status.State = ConnectionStateConnected
		status.Message = fmt.Sprintf(
			"HTTP service connected with client error (%s, status=%d)",
			context,
			statusCode,
		)
	default:
		// 5xx and other errors indicate service error
		atomic.StoreInt32(&c.state, int32(ConnectionStateError))
		status.State = ConnectionStateError
		status.Message = fmt.Sprintf("HTTP service error (%s, status=%d)", context, statusCode)
	}
}
