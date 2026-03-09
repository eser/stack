package middlewares_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/eser/stack/apps/services/pkg/eser-go/httpfx"
	"github.com/eser/stack/apps/services/pkg/eser-go/httpfx/middlewares"
	"github.com/eser/stack/apps/services/pkg/eser-go/lib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResponseTimeMiddleware(t *testing.T) { //nolint:funlen
	t.Parallel()

	tests := []struct {
		name           string
		method         string
		path           string
		handler        httpfx.Handler
		expectedStatus int
		delay          time.Duration
	}{
		{
			name:   "fast_request",
			method: http.MethodGet,
			path:   "/test",
			handler: func(c *httpfx.Context) httpfx.Result {
				return c.Results.Ok()
			},
			expectedStatus: http.StatusNoContent,
			delay:          0,
		},
		{
			name:   "slow_request",
			method: http.MethodPost,
			path:   "/slow",
			handler: func(c *httpfx.Context) httpfx.Result {
				lib.SleepContext(t.Context(), 100*time.Millisecond)

				return c.Results.Ok()
			},
			expectedStatus: http.StatusNoContent,
			delay:          100 * time.Millisecond,
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			// Create a router with the response time middleware
			router := httpfx.NewRouter("/")
			router.Use(middlewares.ResponseTimeMiddleware())

			// Add a test route
			router.Route(tt.method+" "+tt.path, tt.handler)

			// Create and execute test request
			req := httptest.NewRequest(tt.method, tt.path, nil)
			responseRecorder := httptest.NewRecorder()
			router.GetMux().ServeHTTP(responseRecorder, req)

			// Verify the response status
			assert.Equal(t, tt.expectedStatus, responseRecorder.Code)

			// Verify response time header exists and has a valid duration
			responseTime := responseRecorder.Header().Get(middlewares.ResponseTimeHeader)
			require.NotEmpty(t, responseTime)

			// Parse the duration
			duration, err := time.ParseDuration(responseTime)
			require.NoError(t, err)

			// For fast requests, just verify it's a positive duration
			if tt.delay == 0 {
				assert.Positive(t, duration.Nanoseconds())
			} else {
				// For slow requests, verify it's at least the expected delay
				assert.GreaterOrEqual(t, duration.Nanoseconds(), tt.delay.Nanoseconds())
			}
		})
	}
}
