package logfx

import (
	"context"

	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

// Start creates a new span with the given name and slog attributes.
// The returned span must be ended by the caller using span.End().
// Example: defer span.End().
func StartSpan(
	ctx context.Context,
	tracerProvider trace.TracerProvider,
	name string,
	attrs ...any,
) (context.Context, *Span) {
	// Convert slog attributes to OpenTelemetry attributes
	otelAttrs := ConvertSlogAttrsToOtelAttr(attrs)

	tracer := tracerProvider.Tracer(name)

	tracerCtx, otelSpan := tracer.Start( //nolint:spancheck
		ctx,
		name,
		trace.WithAttributes(otelAttrs...),
	)

	return tracerCtx, &Span{ //nolint:spancheck
		span: otelSpan,
	}
}

// Span wraps an OpenTelemetry span with additional convenience methods.
type Span struct {
	span trace.Span
}

func (s *Span) GetTraceID() string {
	return s.span.SpanContext().TraceID().String()
}

func (s *Span) GetSpanID() string {
	return s.span.SpanContext().SpanID().String()
}

// SetAttributes sets attributes on the span using slog attributes.
func (s *Span) SetAttributes(attrs ...any) {
	otelAttrs := ConvertSlogAttrsToOtelAttr(attrs)
	s.span.SetAttributes(otelAttrs...)
}

// AddEvent adds an event to the span with slog attributes.
func (s *Span) AddEvent(name string, attrs ...any) {
	otelAttrs := ConvertSlogAttrsToOtelAttr(attrs)
	s.span.AddEvent(name, trace.WithAttributes(otelAttrs...))
}

// RecordError records an error as a span event and sets the span status.
func (s *Span) RecordError(err error, attrs ...any) {
	if err == nil {
		return
	}

	otelAttrs := ConvertSlogAttrsToOtelAttr(attrs)
	s.span.RecordError(err, trace.WithAttributes(otelAttrs...))
	s.span.SetStatus(codes.Error, err.Error())
}

// End ends the span.
func (s *Span) End() {
	s.span.End()
}
