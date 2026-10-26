// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package otlp_test

import (
	"bytes"
	"context"
	"strings"
	"sync"
	"testing"

	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/eser/stack/pkg/ajan/logfx/otlp"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
)

// memoryLogExporter keeps the exported log records.
type memoryLogExporter struct {
	mu      sync.Mutex
	records []sdklog.Record
}

func (e *memoryLogExporter) Export(_ context.Context, records []sdklog.Record) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	for _, rec := range records {
		e.records = append(e.records, rec.Clone())
	}

	return nil
}

func (e *memoryLogExporter) Shutdown(context.Context) error   { return nil }
func (e *memoryLogExporter) ForceFlush(context.Context) error { return nil }

type resource struct {
	logs   *sdklog.LoggerProvider
	meters *sdkmetric.MeterProvider
	traces *sdktrace.TracerProvider
}

func (r resource) GetLoggerProvider() *sdklog.LoggerProvider   { return r.logs }
func (r resource) GetMeterProvider() *sdkmetric.MeterProvider  { return r.meters }
func (r resource) GetTracerProvider() *sdktrace.TracerProvider { return r.traces }

func TestEnableExportsLogsAndTraces(t *testing.T) {
	t.Parallel()

	logs := &memoryLogExporter{} //nolint:exhaustruct
	spans := tracetest.NewSpanRecorder()

	res := resource{
		logs:   sdklog.NewLoggerProvider(sdklog.WithProcessor(sdklog.NewSimpleProcessor(logs))),
		meters: sdkmetric.NewMeterProvider(),
		traces: sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(spans)),
	}

	logger := logfx.NewLogger(logfx.WithWriter(&bytes.Buffer{}))
	otlp.Enable(logger, res)

	ctx, span := logger.StartSpan(context.Background(), "parity-span")
	logger.InfoContext(ctx, "exported")
	span.End()

	if got := len(spans.Ended()); got != 1 {
		t.Fatalf("expected 1 exported span, got %d", got)
	}

	if spans.Ended()[0].Name() != "parity-span" {
		t.Errorf("span name: %q", spans.Ended()[0].Name())
	}

	logs.mu.Lock()
	defer logs.mu.Unlock()

	if len(logs.records) != 1 {
		t.Fatalf("expected 1 exported record, got %d", len(logs.records))
	}

	// The body is a map that keeps the attributes and the message under "msg".
	if body := logs.records[0].Body().String(); !strings.Contains(body, `"msg":"exported"`) {
		t.Errorf("the exported body should carry the message: %s", body)
	}

	if logs.records[0].SpanID() != spans.Ended()[0].SpanContext().SpanID() {
		t.Errorf("the exported record should carry the span's id")
	}
}
