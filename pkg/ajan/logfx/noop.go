package logfx

import (
	"go.opentelemetry.io/otel/log"
	noopLog "go.opentelemetry.io/otel/log/noop"
	"go.opentelemetry.io/otel/metric"
	noopMetric "go.opentelemetry.io/otel/metric/noop"
	"go.opentelemetry.io/otel/trace"
	noopTrace "go.opentelemetry.io/otel/trace/noop"
)

func NewNoopLoggerProvider() log.LoggerProvider {
	return noopLog.NewLoggerProvider()
}

func NewNoopMeterProvider() metric.MeterProvider {
	return noopMetric.NewMeterProvider()
}

func NewNoopTracerProvider() trace.TracerProvider {
	return noopTrace.NewTracerProvider()
}
