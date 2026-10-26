package connfx

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync/atomic"
	"time"

	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploggrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
)

// OTLP transports, named as OTEL_EXPORTER_OTLP_PROTOCOL names them.
const (
	// OTLPTransportHTTP is OTLP over HTTP with protobuf bodies, the default.
	OTLPTransportHTTP = "http/protobuf"
	// OTLPTransportGRPC is OTLP over gRPC.
	OTLPTransportGRPC = "grpc"

	// OTLPTransportEnv is the standard OpenTelemetry variable read when the
	// connection's "transport" property is not set.
	OTLPTransportEnv = "OTEL_EXPORTER_OTLP_PROTOCOL"
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
	ErrUnsupportedOTLPTransport         = errors.New("unsupported OTLP transport")
)

// OTLPConnection represents an OpenTelemetry Protocol connection.
type OTLPConnection struct {
	lastHealth time.Time

	config *ConfigTarget

	// Exporters
	logExporter    sdklog.Exporter
	metricExporter sdkmetric.Exporter
	traceExporter  *otlptrace.Exporter

	endpoint string
	protocol string
	// transport is OTLPTransportHTTP or OTLPTransportGRPC.
	transport string

	// Configuration
	state    int32 // atomic field for connection state
	insecure bool
}

// OTLPConnectionFactory creates OTLP connections.
type OTLPConnectionFactory struct {
	// getenv reads OTLPTransportEnv; os.Getenv unless a test sets it.
	getenv func(key string) string

	protocol string
}

// NewOTLPConnectionFactory creates a new OTLP connection factory.
func NewOTLPConnectionFactory(protocol string) *OTLPConnectionFactory {
	return &OTLPConnectionFactory{
		getenv:   os.Getenv,
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

	transport, err := f.extractTransport(config)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrFailedToCreateOTLPConnection, err)
	}

	conn := &OTLPConnection{
		lastHealth: time.Time{},

		config: config,

		logExporter:    nil,
		metricExporter: nil,
		traceExporter:  nil,

		endpoint:  endpoint,
		protocol:  f.protocol,
		transport: transport,

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
	status.Message = fmt.Sprintf("OTLP connection is ready (endpoint=%s, transport=%s, secure=%t, check=%s)",
		c.endpoint, c.transport, !c.insecure, healthCheck)
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

// GetLogExporter returns the OTLP log exporter, over HTTP or gRPC.
func (c *OTLPConnection) GetLogExporter() sdklog.Exporter { //nolint:ireturn // the transport picks the exporter
	return c.logExporter
}

// GetMetricExporter returns the OTLP metric exporter, over HTTP or gRPC.
func (c *OTLPConnection) GetMetricExporter() sdkmetric.Exporter { //nolint:ireturn // the transport picks the exporter
	return c.metricExporter
}

// GetTransport returns OTLPTransportHTTP or OTLPTransportGRPC.
func (c *OTLPConnection) GetTransport() string {
	return c.transport
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

func (c *OTLPConnection) createLogExporter(ctx context.Context) (sdklog.Exporter, error) { //nolint:ireturn // the transport picks the exporter
	var (
		exporter sdklog.Exporter
		err      error
	)

	if c.transport == OTLPTransportGRPC {
		opts := []otlploggrpc.Option{otlploggrpc.WithEndpoint(c.endpoint)}
		if c.insecure {
			opts = append(opts, otlploggrpc.WithInsecure())
		}

		exporter, err = otlploggrpc.New(ctx, opts...)
	} else {
		opts := []otlploghttp.Option{otlploghttp.WithEndpoint(c.endpoint)}
		if c.insecure {
			opts = append(opts, otlploghttp.WithInsecure())
		}

		exporter, err = otlploghttp.New(ctx, opts...)
	}

	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrFailedToCreateOTLPLogExporter, err)
	}

	return exporter, nil
}

func (c *OTLPConnection) createMetricExporter( //nolint:ireturn // the transport picks the exporter
	ctx context.Context,
) (sdkmetric.Exporter, error) {
	var (
		exporter sdkmetric.Exporter
		err      error
	)

	if c.transport == OTLPTransportGRPC {
		opts := []otlpmetricgrpc.Option{otlpmetricgrpc.WithEndpoint(c.endpoint)}
		if c.insecure {
			opts = append(opts, otlpmetricgrpc.WithInsecure())
		}

		exporter, err = otlpmetricgrpc.New(ctx, opts...)
	} else {
		opts := []otlpmetrichttp.Option{otlpmetrichttp.WithEndpoint(c.endpoint)}
		if c.insecure {
			opts = append(opts, otlpmetrichttp.WithInsecure())
		}

		exporter, err = otlpmetrichttp.New(ctx, opts...)
	}

	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrFailedToCreateOTLPMetricExporter, err)
	}

	return exporter, nil
}

func (c *OTLPConnection) createTraceExporter(ctx context.Context) (*otlptrace.Exporter, error) {
	exporter, err := c.newTraceExporter(ctx)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrFailedToCreateOTLPTraceExporter, err)
	}

	return exporter, nil
}

// newTraceExporter builds a trace exporter on the connection's transport.
func (c *OTLPConnection) newTraceExporter(ctx context.Context) (*otlptrace.Exporter, error) {
	if c.transport == OTLPTransportGRPC {
		opts := []otlptracegrpc.Option{otlptracegrpc.WithEndpoint(c.endpoint)}
		if c.insecure {
			opts = append(opts, otlptracegrpc.WithInsecure())
		}

		return otlptracegrpc.New(ctx, opts...) //nolint:wrapcheck // wrapped by the callers
	}

	opts := []otlptracehttp.Option{otlptracehttp.WithEndpoint(c.endpoint)}
	if c.insecure {
		opts = append(opts, otlptracehttp.WithInsecure())
	}

	return otlptracehttp.New(ctx, opts...) //nolint:wrapcheck // wrapped by the callers
}

func (c *OTLPConnection) performHealthCheck(ctx context.Context) (string, error) {
	// For OTLP health check, we try to create a minimal exporter
	// This validates connectivity and configuration
	testExporter, err := c.newTraceExporter(ctx)
	if err != nil {
		return "", fmt.Errorf("%w: %w", ErrFailedToCreateTestExporter, err)
	}

	// Clean up test exporter
	defer func() {
		_ = testExporter.Shutdown(ctx) // Ignore shutdown errors for health check
	}()

	return "connection_validated", nil
}

// extractTransport is the "transport" property, else OTEL_EXPORTER_OTLP_PROTOCOL,
// else http/protobuf. http/json, which the Go exporters do not offer, and
// any other value fail.
func (f *OTLPConnectionFactory) extractTransport(config *ConfigTarget) (string, error) {
	transport := ""
	if config.Properties != nil {
		if value, ok := config.Properties["transport"].(string); ok {
			transport = value
		}
	}

	if transport == "" && f.getenv != nil {
		transport = f.getenv(OTLPTransportEnv)
	}

	switch transport {
	case "", OTLPTransportHTTP:
		return OTLPTransportHTTP, nil
	case OTLPTransportGRPC:
		return OTLPTransportGRPC, nil
	default:
		return "", fmt.Errorf("%w: %q (use %q or %q)",
			ErrUnsupportedOTLPTransport, transport, OTLPTransportHTTP, OTLPTransportGRPC)
	}
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
