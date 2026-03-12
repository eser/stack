package middlewares_test

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/eser/stack/apps/services/pkg/eser-go/httpfx"
	"github.com/eser/stack/apps/services/pkg/eser-go/httpfx/middlewares"
	"github.com/eser/stack/apps/services/pkg/eser-go/logfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

const (
	// W3C Trace Context header.
	TraceparentHeader = "Traceparent"
)

func TestTraceIDIntegration(t *testing.T) {
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
		name                   string
		incomingTraceparent    string
		expectTraceID          bool
		expectInLogs           bool
		expectInResponseHeader bool
	}{
		{
			name:                   "with existing trace ID",
			incomingTraceparent:    "00-3f9fee6a47f52385bb27f916b1b4abb2-b7ad6b7169203331-01",
			expectTraceID:          true,
			expectInLogs:           true,
			expectInResponseHeader: true,
		},
		{
			name:                   "without existing trace ID - should generate one",
			incomingTraceparent:    "",
			expectTraceID:          true,
			expectInLogs:           true,
			expectInResponseHeader: true,
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			traceparentFromResponse, logOutput := executeTestRequest(t, tt.incomingTraceparent)

			// Verify response header
			if tt.expectInResponseHeader {
				assert.NotEmpty(t, traceparentFromResponse)

				if tt.incomingTraceparent != "" {
					// Extract trace ID from both headers to compare
					incomingTraceID := extractTraceIDFromTraceparent(tt.incomingTraceparent)
					responseTraceID := extractTraceIDFromTraceparent(traceparentFromResponse)
					assert.Equal(t, incomingTraceID, responseTraceID)
				}
			}

			// Verify logs contain trace ID
			if tt.expectInLogs {
				verifyTraceInLogs(
					t,
					logOutput,
					tt.incomingTraceparent,
					traceparentFromResponse,
				)
			}
		})
	}
}

func executeTestRequest(t *testing.T, incomingTraceparent string) (string, string) {
	t.Helper()

	// Capture logs
	var logBuffer bytes.Buffer

	// Create logger with JSON output for easy parsing
	logConfig := &logfx.Config{
		Level:                         "DEBUG",
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

	// Create router with middleware chain
	router := httpfx.NewRouter("/")

	// Add trace ID middleware first
	router.Use(middlewares.TracingMiddleware(logger, ""))

	// Create a test handler that logs something
	testHandler := func(ctx *httpfx.Context) httpfx.Result {
		// This simulates application logging within the request handler
		logger.InfoContext(ctx.Request.Context(), "Processing business logic",
			slog.String("operation", "test-operation"),
			slog.String("user_id", "user123"),
		)

		return ctx.Results.PlainText([]byte("success"))
	}

	// Add the route
	router.Route("GET /test", testHandler)

	// Create a test request
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	if incomingTraceparent != "" {
		req.Header.Set(TraceparentHeader, incomingTraceparent)
	}

	// Create a test response recorder
	w := httptest.NewRecorder()

	// Execute the request through the router
	router.GetMux().ServeHTTP(w, req)

	traceparentFromResponse := w.Header().Get(TraceparentHeader)
	logOutput := logBuffer.String()

	return traceparentFromResponse, logOutput
}

// extractTraceIDFromTraceparent extracts the trace ID from a W3C traceparent header
// Format: version-traceId-spanId-traceFlags.
func extractTraceIDFromTraceparent(traceparent string) string {
	if traceparent == "" {
		return ""
	}

	parts := strings.Split(traceparent, "-")
	if len(parts) != 4 {
		return ""
	}

	return parts[1] // trace ID is the second part
}

func verifyTraceInLogs(
	t *testing.T,
	logOutput string,
	incomingTraceparent string,
	traceparentFromResponse string,
) {
	t.Helper()

	assert.NotEmpty(t, logOutput)

	// Split log entries (each line is a JSON log entry)
	logLines := strings.Split(strings.TrimSpace(logOutput), "\n")
	assert.GreaterOrEqual(t, len(logLines), 2) // At least business logic and request end

	// Extract expected trace ID from traceparent headers
	var expectedTraceID string
	if incomingTraceparent != "" {
		expectedTraceID = extractTraceIDFromTraceparent(incomingTraceparent)
	} else {
		expectedTraceID = extractTraceIDFromTraceparent(traceparentFromResponse)
	}

	// The expected trace ID should not be empty at this point
	assert.NotEmpty(t, expectedTraceID, "Expected trace ID should not be empty")

	for i, logLine := range logLines {
		if strings.TrimSpace(logLine) == "" {
			continue
		}

		var logEntry map[string]any

		err := json.Unmarshal([]byte(logLine), &logEntry)
		require.NoError(t, err, "Failed to parse log line %d: %s", i, logLine)

		// Check that trace_id is present
		traceIDInLog, hasTraceID := logEntry["trace_id"]
		assert.True(t, hasTraceID, "Log entry %d missing trace_id: %s", i, logLine)

		if hasTraceID {
			assert.Equal(t, expectedTraceID, traceIDInLog,
				"Trace ID mismatch in log entry %d", i)
		}
	}

	// Verify specific log entries contain expected information
	foundEntries := verifyLogEntries(t, logLines)
	assert.True(t, foundEntries.businessLogic, "Business logic log entry not found")
	assert.True(t, foundEntries.requestEnd, "Request end log entry not found")
}

type foundLogEntries struct {
	businessLogic bool
	requestStart  bool
	requestEnd    bool
}

func verifyLogEntries(t *testing.T, logLines []string) foundLogEntries {
	t.Helper()

	var found foundLogEntries

	for _, logLine := range logLines {
		if strings.TrimSpace(logLine) == "" {
			continue
		}

		var logEntry map[string]any

		err := json.Unmarshal([]byte(logLine), &logEntry)
		require.NoError(t, err)

		msg, hasMsg := logEntry["msg"]
		if !hasMsg {
			continue
		}

		switch msg {
		case "Processing business logic":
			found.businessLogic = true

			assert.Equal(t, "test-operation", logEntry["operation"])
			assert.Equal(t, "user123", logEntry["user_id"])
		case "HTTP request started":
			found.requestStart = true

			assert.Equal(t, "GET", logEntry["http.method"])
			assert.Equal(t, "/test", logEntry["http.path"])
		case "HTTP request completed":
			found.requestEnd = true

			assert.Equal(t, "GET", logEntry["http.method"])
			assert.Equal(t, "/test", logEntry["http.path"])
			assert.InEpsilon(t, 200.0, logEntry["http.status_code"], 0.01)
		}
	}

	return found
}
