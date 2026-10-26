// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package logfx

import (
	"context"
	"net/http"

	"go.opentelemetry.io/otel/propagation"
)

// headerPropagator carries the trace context and baggage in HTTP headers. It
// is native-only: the propagation package links net/http and crypto/tls,
// which the WASM build has no use for and which would cost it 2 MB.
var headerPropagator = propagation.NewCompositeTextMapPropagator( //nolint:gochecknoglobals
	propagation.TraceContext{}, // W3C Trace Context
	propagation.Baggage{},      // W3C Baggage
)

// PropagatorExtract returns ctx with the trace context and baggage read from
// the W3C headers.
func (l *Logger) PropagatorExtract(ctx context.Context, headers http.Header) context.Context {
	return headerPropagator.Extract(ctx, propagation.HeaderCarrier(headers))
}

// PropagatorInject writes ctx's trace context and baggage as W3C headers.
func (l *Logger) PropagatorInject(ctx context.Context, headers http.Header) {
	headerPropagator.Inject(ctx, propagation.HeaderCarrier(headers))
}
