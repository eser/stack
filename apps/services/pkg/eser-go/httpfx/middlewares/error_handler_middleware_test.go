package middlewares_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/eser/stack/apps/services/pkg/eser-go/httpfx"
	"github.com/eser/stack/apps/services/pkg/eser-go/httpfx/middlewares"
	"github.com/stretchr/testify/assert"
)

func TestErrorHandlerMiddleware(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name           string
		handler        httpfx.Handler
		expectedStatus int
		expectedBody   string
	}{
		{
			name: "success_response",
			handler: func(c *httpfx.Context) httpfx.Result {
				return c.Results.Ok()
			},
			expectedStatus: http.StatusNoContent,
			expectedBody:   "",
		},
		{
			name: "error_response",
			handler: func(c *httpfx.Context) httpfx.Result {
				return c.Results.Error(
					http.StatusInternalServerError,
					httpfx.WithPlainText("test error"),
				)
			},
			expectedStatus: http.StatusInternalServerError,
			expectedBody:   "test error",
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			// Create a router with the error handler middleware
			router := httpfx.NewRouter("/")
			router.Use(middlewares.ErrorHandlerMiddleware())

			// Add a test route
			router.Route("GET /test", tt.handler)

			// Create and execute test request
			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			w := httptest.NewRecorder()
			router.GetMux().ServeHTTP(w, req)

			// Verify the response
			assert.Equal(t, tt.expectedStatus, w.Code)
			assert.Equal(t, tt.expectedBody, w.Body.String())
		})
	}
}
