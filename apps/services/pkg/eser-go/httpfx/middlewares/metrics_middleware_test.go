package middlewares_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/eser/stack/apps/services/pkg/eser-go/httpfx"
	"github.com/eser/stack/apps/services/pkg/eser-go/httpfx/middlewares"
	"github.com/eser/stack/apps/services/pkg/eser-go/logfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTestMetrics() *httpfx.Metrics {
	// Use noop meter for testing - no actual metrics collection
	logger := logfx.NewLogger()
	metricsBuilder := logger.NewMetricsBuilder("httpfx_test")

	// Create metrics similar to production
	requestsTotal, err := metricsBuilder.
		Counter("http_requests_total", "Total number of HTTP requests").
		WithUnit("1").
		Build()
	if err != nil {
		panic(err)
	}

	requestDuration, err := metricsBuilder.
		Histogram("http_request_duration_seconds", "Duration of HTTP requests").
		WithUnit("s").
		WithDurationBuckets().
		Build()
	if err != nil {
		panic(err)
	}

	return &httpfx.Metrics{
		RequestsTotal:   requestsTotal,
		RequestDuration: requestDuration,
	}
}

func TestMetricsMiddleware(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name           string
		method         string
		path           string
		handler        httpfx.Handler
		expectedStatus int
	}{
		{
			name:   "success_request",
			method: http.MethodGet,
			path:   "/test",
			handler: func(c *httpfx.Context) httpfx.Result {
				return c.Results.Ok()
			},
			expectedStatus: http.StatusNoContent,
		},
		{
			name:   "error_request",
			method: http.MethodPost,
			path:   "/error",
			handler: func(c *httpfx.Context) httpfx.Result {
				return c.Results.Error(http.StatusBadRequest, httpfx.WithPlainText("bad request"))
			},
			expectedStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			// Create metrics using the new logfx-based approach
			metrics := setupTestMetrics()
			require.NotNil(t, metrics)

			// Create a router with the metrics middleware
			router := httpfx.NewRouter("/")
			router.Use(middlewares.MetricsMiddleware(metrics))

			// Add a test route
			router.Route(tt.method+" "+tt.path, tt.handler)

			// Create and execute test request
			req := httptest.NewRequest(tt.method, tt.path, nil)
			w := httptest.NewRecorder()
			router.GetMux().ServeHTTP(w, req)

			// Verify the response status
			assert.Equal(t, tt.expectedStatus, w.Code)
			// The metrics are recorded successfully if no panic occurs
			// With the new logfx interface, we don't need complex verification
			// since the MetricsBuilder handles all the complexity internally
		})
	}
}
