package middlewares_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/eser/stack/apps/services/pkg/eser-go/httpfx"
	"github.com/eser/stack/apps/services/pkg/eser-go/httpfx/middlewares"
	"github.com/stretchr/testify/assert"
)

func TestSecurityHeadersMiddleware(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		method string
		path   string
	}{
		{
			name:   "get_request",
			method: http.MethodGet,
			path:   "/test",
		},
		{
			name:   "post_request",
			method: http.MethodPost,
			path:   "/test",
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			router := httpfx.NewRouter("/")
			router.Use(middlewares.SecurityHeadersMiddleware())

			router.Route(tt.method+" "+tt.path, func(c *httpfx.Context) httpfx.Result {
				return c.Results.Ok()
			})

			req := httptest.NewRequest(tt.method, tt.path, nil)
			responseRecorder := httptest.NewRecorder()
			router.GetMux().ServeHTTP(responseRecorder, req)

			assert.Equal(t, "nosniff", responseRecorder.Header().Get("X-Content-Type-Options"))
			assert.Equal(t, "DENY", responseRecorder.Header().Get("X-Frame-Options"))
			assert.Equal(
				t,
				"max-age=31536000; includeSubDomains",
				responseRecorder.Header().Get("Strict-Transport-Security"),
			)
		})
	}
}
