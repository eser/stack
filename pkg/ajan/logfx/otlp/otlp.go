// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package otlp connects a logfx logger to the OpenTelemetry SDK. It is the
// SDK-typed entry point that logfx itself no longer has, so that logfx links
// no SDK and runs in the WASM build; native builds and services import this
// package to export logs, traces and metrics.
package otlp

import (
	"github.com/eser/stack/pkg/ajan/logfx"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

// ConnectionResource holds the SDK providers of an OTLP connection.
// *connfx.OTLPConnectionResource is the one this codebase provides.
type ConnectionResource interface {
	GetLoggerProvider() *sdklog.LoggerProvider
	GetMeterProvider() *sdkmetric.MeterProvider
	GetTracerProvider() *sdktrace.TracerProvider
}

// LogExporter is a value that only exports logs.
type LogExporter interface {
	GetLoggerProvider() *sdklog.LoggerProvider
}

// Enable makes logger export its records, spans and metrics through conn's
// providers. It replaces the former logfx Logger.EnableOTLP method.
func Enable(logger *logfx.Logger, conn ConnectionResource) {
	logger.EnableTelemetry(logfx.TelemetryProviders{
		Logger: conn.GetLoggerProvider(),
		Meter:  conn.GetMeterProvider(),
		Tracer: conn.GetTracerProvider(),
	})
}
