package middlewares_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/httpfx/middlewares"
	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

func TestTracingMiddleware(t *testing.T) { //nolint:funlen
	t.Parallel()

	// Set up W3C Trace Context propagator for tests
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	// Set up a basic tracer provider for tests
	tracerProvider := sdktrace.NewTracerProvider()
	otel.SetTracerProvider(tracerProvider)

	tests := []struct {
		name                string
		existingHeaderValue string
		wantHeaderExists    bool
	}{
		{ //nolint:exhaustruct
			name:             "no_existing_trace_id",
			wantHeaderExists: true,
		},
		{
			name:                "existing_trace_id",
			existingHeaderValue: "00-059c5f97a0fe6a75a1a2130b25d2d0de-b7ad6b7169203331-01",
			wantHeaderExists:    true,
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			// Capture logs
			var logBuffer bytes.Buffer

			// Create logger with JSON output for easy parsing
			logConfig := &logfx.Config{
				Level:                         "INFO",
				DefaultLogger:                 false,
				PrettyMode:                    false,
				AddSource:                     false,
				NoNativeCollectorRegistration: false,
			}
			logger := logfx.NewLogger(
				logfx.WithWriter(&logBuffer),
				logfx.WithConfig(logConfig),
			)

			// Make the logger use the global tracer provider
			logger.InnerTracerProvider = otel.GetTracerProvider()

			// Create a test request
			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			if tt.existingHeaderValue != "" {
				req.Header.Set("Traceparent", tt.existingHeaderValue)
			}

			// Create a test response recorder
			responseRecorder := httptest.NewRecorder()

			// Create a test context
			ctx := &httpfx.Context{
				Request:        req,
				ResponseWriter: responseRecorder,
				Results:        httpfx.Results{},
			}

			// Create and execute the middleware
			middleware := middlewares.TracingMiddleware(logger, "")
			result := middleware(ctx)
			require.NotNil(t, result)

			// Check the response header
			traceparent := responseRecorder.Header().Get("Traceparent")

			if tt.wantHeaderExists {
				assert.NotEmpty(t, traceparent)

				if tt.existingHeaderValue != "" {
					// Extract trace ID from both headers to compare
					// Format: version-traceId-spanId-traceFlags
					incomingParts := strings.Split(tt.existingHeaderValue, "-")
					responseParts := strings.Split(traceparent, "-")

					if len(incomingParts) == 4 && len(responseParts) == 4 {
						incomingTraceID := incomingParts[1]
						responseTraceID := responseParts[1]
						assert.Equal(t, incomingTraceID, responseTraceID)
					}
				}
			} else {
				assert.Empty(t, traceparent)
			}
		})
	}
}
