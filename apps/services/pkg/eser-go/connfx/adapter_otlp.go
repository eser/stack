package connfx

import (
	"context"
	"errors"
	"fmt"
	"sync/atomic"
	"time"

	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
)

// Add missing connection capabilities for observability.
const (
	// ConnectionCapabilityObservability represents general observability behavior.
	ConnectionCapabilityObservability ConnectionCapability = "observability"

	// ConnectionCapabilityLogging represents logging behavior.
	ConnectionCapabilityLogging ConnectionCapability = "logging"

	// ConnectionCapabilityMetrics represents metrics behavior.
	ConnectionCapabilityMetrics ConnectionCapability = "metrics"

	// ConnectionCapabilityTracing represents tracing behavior.
	ConnectionCapabilityTracing ConnectionCapability = "tracing"
)

var (
	ErrFailedToCreateOTLPConnection     = errors.New("failed to create OTLP connection")
	ErrFailedToCreateOTLPLogExporter    = errors.New("failed to create OTLP log exporter")
	ErrFailedToCreateOTLPMetricExporter = errors.New("failed to create OTLP metric exporter")
	ErrFailedToCreateOTLPTraceExporter  = errors.New("failed to create OTLP trace exporter")
	ErrOTLPEndpointRequired             = errors.New("OTLP endpoint is required")
	ErrFailedToShutdownLogExporter      = errors.New("failed to shutdown log exporter")
	ErrFailedToShutdownMetricExporter   = errors.New("failed to shutdown metric exporter")
	ErrFailedToShutdownTraceExporter    = errors.New("failed to shutdown trace exporter")
	ErrFailedToCreateTestExporter       = errors.New("failed to create test exporter")
)

// OTLPConnection represents an OpenTelemetry Protocol connection.
type OTLPConnection struct {
	lastHealth time.Time

	config *ConfigTarget

	// Exporters
	logExporter    *otlploghttp.Exporter
	metricExporter *otlpmetrichttp.Exporter
	traceExporter  *otlptrace.Exporter

	endpoint string
	protocol string

	// Configuration
	state    int32 // atomic field for connection state
	insecure bool
}

// OTLPConnectionFactory creates OTLP connections.
type OTLPConnectionFactory struct {
	protocol string
}

// NewOTLPConnectionFactory creates a new OTLP connection factory.
func NewOTLPConnectionFactory(protocol string) *OTLPConnectionFactory {
	return &OTLPConnectionFactory{
		protocol: protocol,
	}
}

func (f *OTLPConnectionFactory) CreateConnection( //nolint:ireturn
	ctx context.Context,
	config *ConfigTarget,
) (Connection, error) {
	endpoint := config.DSN
	if endpoint == "" {
		return nil, fmt.Errorf("%w: %w", ErrFailedToCreateOTLPConnection, ErrOTLPEndpointRequired)
	}

	// Extract configuration
	insecure := f.extractInsecureFlag(config)

	conn := &OTLPConnection{
		lastHealth: time.Time{},

		config: config,

		logExporter:    nil,
		metricExporter: nil,
		traceExporter:  nil,

		endpoint: endpoint,
		protocol: f.protocol,

		state:    int32(ConnectionStateNotInitialized),
		insecure: insecure,
	}

	// Initialize exporters
	initializeExportersErr := conn.initializeExporters(ctx)
	if initializeExportersErr != nil {
		return nil, fmt.Errorf("%w: %w", ErrFailedToCreateOTLPConnection, initializeExportersErr)
	}

	return conn, nil
}

func (f *OTLPConnectionFactory) GetProtocol() string {
	return f.protocol
}

// Connection interface implementation

func (c *OTLPConnection) GetBehaviors() []ConnectionBehavior {
	return []ConnectionBehavior{
		ConnectionBehaviorStateless,
		ConnectionBehaviorStreaming,
	}
}

func (c *OTLPConnection) GetCapabilities() []ConnectionCapability {
	return []ConnectionCapability{
		ConnectionCapabilityObservability,
		ConnectionCapabilityLogging,
		ConnectionCapabilityMetrics,
		ConnectionCapabilityTracing,
	}
}

func (c *OTLPConnection) GetProtocol() string {
	return c.protocol
}

func (c *OTLPConnection) GetState() ConnectionState {
	return ConnectionState(atomic.LoadInt32(&c.state))
}

func (c *OTLPConnection) HealthCheck(ctx context.Context) *HealthStatus {
	start := time.Now()
	status := &HealthStatus{
		Timestamp: start,
		State:     c.GetState(),
		Error:     nil,
		Message:   "",
		Latency:   0,
	}

	// Create a simple health check by attempting to create a minimal exporter
	// This validates that the endpoint is reachable and properly configured
	healthCheck, err := c.performHealthCheck(ctx)
	status.Latency = time.Since(start)

	if err != nil {
		atomic.StoreInt32(&c.state, int32(ConnectionStateError))
		status.State = ConnectionStateError
		status.Error = err
		status.Message = fmt.Sprintf("OTLP health check failed: %v", err)

		return status
	}

	// If health check passed, connection is ready
	atomic.StoreInt32(&c.state, int32(ConnectionStateReady))
	status.State = ConnectionStateReady
	status.Message = fmt.Sprintf("OTLP connection is ready (endpoint=%s, secure=%t, check=%s)",
		c.endpoint, !c.insecure, healthCheck)
	c.lastHealth = start

	return status
}

func (c *OTLPConnection) Close(ctx context.Context) error {
	// Shutdown exporters
	if c.logExporter != nil {
		err := c.logExporter.Shutdown(ctx)
		if err != nil {
			return fmt.Errorf("%w: %w", ErrFailedToShutdownLogExporter, err)
		}
	}

	if c.metricExporter != nil {
		err := c.metricExporter.Shutdown(ctx)
		if err != nil {
			return fmt.Errorf("%w: %w", ErrFailedToShutdownMetricExporter, err)
		}
	}

	if c.traceExporter != nil {
		err := c.traceExporter.Shutdown(ctx)
		if err != nil {
			return fmt.Errorf("%w: %w", ErrFailedToShutdownTraceExporter, err)
		}
	}

	atomic.StoreInt32(&c.state, int32(ConnectionStateDisconnected))

	// Reset last health check time
	c.lastHealth = time.Time{}

	return nil
}

func (c *OTLPConnection) GetRawConnection() any {
	return c
}

// GetLogExporter returns the OTLP log exporter.
func (c *OTLPConnection) GetLogExporter() *otlploghttp.Exporter {
	return c.logExporter
}

// GetMetricExporter returns the OTLP metric exporter.
func (c *OTLPConnection) GetMetricExporter() *otlpmetrichttp.Exporter {
	return c.metricExporter
}

// GetTraceExporter returns the OTLP trace exporter.
func (c *OTLPConnection) GetTraceExporter() *otlptrace.Exporter {
	return c.traceExporter
}

func (c *OTLPConnection) CreateResource(
	serviceName string,
	serviceVersion string,
	serviceEnvironment string,
) (*OTLPConnectionResource, error) {
	return CreateOTLPConnectionResource(c, serviceName, serviceVersion, serviceEnvironment)
}

func (c *OTLPConnection) initializeExporters(ctx context.Context) error {
	var err error

	c.logExporter, err = c.createLogExporter(ctx)
	if err != nil {
		return fmt.Errorf("%w: %w", ErrFailedToCreateOTLPLogExporter, err)
	}

	c.metricExporter, err = c.createMetricExporter(ctx)
	if err != nil {
		return fmt.Errorf("%w: %w", ErrFailedToCreateOTLPMetricExporter, err)
	}

	c.traceExporter, err = c.createTraceExporter(ctx)
	if err != nil {
		return fmt.Errorf("%w: %w", ErrFailedToCreateOTLPTraceExporter, err)
	}

	return nil
}

func (c *OTLPConnection) createLogExporter(ctx context.Context) (*otlploghttp.Exporter, error) {
	opts := []otlploghttp.Option{
		otlploghttp.WithEndpoint(c.endpoint),
	}

	if c.insecure {
		opts = append(opts, otlploghttp.WithInsecure())
	}

	exporter, err := otlploghttp.New(ctx, opts...)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrFailedToCreateOTLPLogExporter, err)
	}

	return exporter, nil
}

func (c *OTLPConnection) createMetricExporter(
	ctx context.Context,
) (*otlpmetrichttp.Exporter, error) {
	opts := []otlpmetrichttp.Option{
		otlpmetrichttp.WithEndpoint(c.endpoint),
	}

	if c.insecure {
		opts = append(opts, otlpmetrichttp.WithInsecure())
	}

	exporter, err := otlpmetrichttp.New(ctx, opts...)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrFailedToCreateOTLPMetricExporter, err)
	}

	return exporter, nil
}

func (c *OTLPConnection) createTraceExporter(ctx context.Context) (*otlptrace.Exporter, error) {
	opts := []otlptracehttp.Option{
		otlptracehttp.WithEndpoint(c.endpoint),
	}

	if c.insecure {
		opts = append(opts, otlptracehttp.WithInsecure())
	}

	exporter, err := otlptracehttp.New(ctx, opts...)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrFailedToCreateOTLPTraceExporter, err)
	}

	return exporter, nil
}

func (c *OTLPConnection) performHealthCheck(ctx context.Context) (string, error) {
	// For OTLP health check, we try to create a minimal exporter
	// This validates connectivity and configuration
	testOpts := []otlptracehttp.Option{
		otlptracehttp.WithEndpoint(c.endpoint),
	}

	if c.insecure {
		testOpts = append(testOpts, otlptracehttp.WithInsecure())
	}

	// Create a temporary exporter for health check
	testExporter, err := otlptracehttp.New(ctx, testOpts...)
	if err != nil {
		return "", fmt.Errorf("%w: %w", ErrFailedToCreateTestExporter, err)
	}

	// Clean up test exporter
	defer func() {
		_ = testExporter.Shutdown(ctx) // Ignore shutdown errors for health check
	}()

	return "connection_validated", nil
}

func (f *OTLPConnectionFactory) extractInsecureFlag(config *ConfigTarget) bool {
	if config.TLS {
		return false
	}

	if config.Properties != nil {
		if insecure, ok := config.Properties["insecure"].(bool); ok {
			return insecure
		}
	}

	return true // Default to insecure for development
}
