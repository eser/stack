package connfx

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.17.0"
)

const (
	DefaultBatchTimeout   = 5 * time.Second
	DefaultExportInterval = 30 * time.Second
	DefaultBatchSize      = 512
	DefaultSampleRatio    = 1.0
)

var (
	ErrFailedToCreateResource = errors.New("failed to create resource")
	ErrFailedToMergeResources = errors.New("failed to merge resources")

	ErrFailedToShutdownLogProvider    = errors.New("failed to shutdown log provider")
	ErrFailedToShutdownMeterProvider  = errors.New("failed to shutdown meter provider")
	ErrFailedToShutdownTracerProvider = errors.New("failed to shutdown tracer provider")
)

type OTLPConnectionImpl interface {
	GetLogExporter() *otlploghttp.Exporter
	GetMetricExporter() *otlpmetrichttp.Exporter
	GetTraceExporter() *otlptrace.Exporter
}

type OTLPConnectionResource struct {
	// Resource for telemetry attribution
	resource *resource.Resource

	// Providers
	loggerProvider *sdklog.LoggerProvider
	meterProvider  *sdkmetric.MeterProvider
	tracerProvider *sdktrace.TracerProvider

	serviceName        string
	serviceVersion     string
	serviceEnvironment string
}

func CreateOTLPConnectionResource(
	otlpConnection OTLPConnectionImpl,
	serviceName string,
	serviceVersion string,
	serviceEnvironment string,
) (*OTLPConnectionResource, error) {
	resource := &OTLPConnectionResource{
		resource: nil,

		loggerProvider: nil,
		meterProvider:  nil,
		tracerProvider: nil,

		serviceName:        serviceName,
		serviceVersion:     serviceVersion,
		serviceEnvironment: serviceEnvironment,
	}

	err := resource.createResource(serviceName, serviceVersion, serviceEnvironment)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrFailedToCreateResource, err)
	}

	resource.initializeProviders(otlpConnection)

	return resource, nil
}

// GetResource returns the resource used for telemetry attribution.
func (c *OTLPConnectionResource) GetResource() *resource.Resource {
	return c.resource
}

// GetLoggerProvider returns the OpenTelemetry log provider.
func (c *OTLPConnectionResource) GetLoggerProvider() *sdklog.LoggerProvider {
	return c.loggerProvider
}

// GetMeterProvider returns the OpenTelemetry meter provider.
func (c *OTLPConnectionResource) GetMeterProvider() *sdkmetric.MeterProvider {
	return c.meterProvider
}

// GetTracerProvider returns the OpenTelemetry tracer provider.
func (c *OTLPConnectionResource) GetTracerProvider() *sdktrace.TracerProvider {
	return c.tracerProvider
}

func (c *OTLPConnectionResource) Close(ctx context.Context) error {
	if c.loggerProvider != nil {
		err := c.loggerProvider.Shutdown(ctx)
		if err != nil {
			return fmt.Errorf("%w: %w", ErrFailedToShutdownLogProvider, err)
		}
	}

	if c.meterProvider != nil {
		err := c.meterProvider.Shutdown(ctx)
		if err != nil {
			return fmt.Errorf("%w: %w", ErrFailedToShutdownMeterProvider, err)
		}
	}

	if c.tracerProvider != nil {
		err := c.tracerProvider.Shutdown(ctx)
		if err != nil {
			return fmt.Errorf("%w: %w", ErrFailedToShutdownTracerProvider, err)
		}
	}

	return nil
}

func (c *OTLPConnectionResource) createResource(
	serviceName string,
	serviceVersion string,
	serviceEnvironment string,
) error {
	attributes := []attribute.KeyValue{
		semconv.ServiceName(serviceName),
		semconv.ServiceVersion(serviceVersion),
		semconv.DeploymentEnvironment(serviceEnvironment),
	}

	// Create resource without explicit schema URL to avoid conflicts
	customResource := resource.NewWithAttributes("", attributes...)

	res, err := resource.Merge(resource.Default(), customResource)
	if err != nil {
		return fmt.Errorf("%w: %w", ErrFailedToMergeResources, err)
	}

	c.resource = res

	return nil
}

func (c *OTLPConnectionResource) initializeProviders(otlpConnection OTLPConnectionImpl) {
	// Create log provider
	logExporter := otlpConnection.GetLogExporter()
	if logExporter != nil {
		processor := sdklog.NewBatchProcessor(logExporter)

		c.loggerProvider = sdklog.NewLoggerProvider(
			sdklog.WithProcessor(processor),
			sdklog.WithResource(c.resource),
		)
	}

	// Create meter provider
	metricExporter := otlpConnection.GetMetricExporter()
	if metricExporter != nil {
		reader := sdkmetric.NewPeriodicReader(
			metricExporter,
			sdkmetric.WithInterval(DefaultExportInterval),
		)

		c.meterProvider = sdkmetric.NewMeterProvider(
			sdkmetric.WithResource(c.resource),
			sdkmetric.WithReader(reader),
		)
	}

	// Create tracer provider
	traceExporter := otlpConnection.GetTraceExporter()
	if traceExporter != nil {
		processor := sdktrace.NewBatchSpanProcessor(
			traceExporter,
			sdktrace.WithBatchTimeout(DefaultBatchTimeout),
			sdktrace.WithMaxExportBatchSize(DefaultBatchSize),
		)

		c.tracerProvider = sdktrace.NewTracerProvider(
			sdktrace.WithResource(c.resource),
			sdktrace.WithSpanProcessor(processor),
			sdktrace.WithSampler(sdktrace.TraceIDRatioBased(DefaultSampleRatio)),
		)
	}
}
