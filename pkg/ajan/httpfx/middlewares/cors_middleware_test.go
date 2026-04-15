package middlewares_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/httpfx/middlewares"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCorsMiddleware(t *testing.T) { //nolint:funlen
	t.Parallel()

	t.Run("default_options", func(t *testing.T) {
		t.Parallel()

		middleware := middlewares.CorsMiddleware()

		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		responseRecorder := httptest.NewRecorder()
		ctx := &httpfx.Context{
			Request:        req,
			ResponseWriter: responseRecorder,
			Results:        httpfx.Results{},
		}

		result := middleware(ctx)
		require.NotNil(t, result)

		// Default origin is wildcard
		assert.Equal(
			t,
			"*",
			responseRecorder.Header().Get(middlewares.AccessControlAllowOriginHeader),
		)
		// Default credentials is true for development convenience
		assert.Equal(
			t,
			"true",
			responseRecorder.Header().Get(middlewares.AccessControlAllowCredentialsHeader),
		)
		// Default headers include common values
		assert.Equal(
			t,
			"Accept, Authorization, Content-Type, Origin, Traceparent, Tracestate, X-Requested-With",
			responseRecorder.Header().Get(middlewares.AccessControlAllowHeadersHeader),
		)
		// Default methods include common HTTP methods
		assert.Equal(
			t,
			"GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS",
			responseRecorder.Header().Get(middlewares.AccessControlAllowMethodsHeader),
		)
	})

	t.Run("with_allow_origin", func(t *testing.T) {
		t.Parallel()

		middleware := middlewares.CorsMiddleware(middlewares.WithAllowOrigin("https://example.com"))

		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		responseRecorder := httptest.NewRecorder()
		ctx := &httpfx.Context{
			Request:        req,
			ResponseWriter: responseRecorder,
			Results:        httpfx.Results{},
		}

		result := middleware(ctx)
		require.NotNil(t, result)

		assert.Equal(
			t,
			"https://example.com",
			responseRecorder.Header().Get(middlewares.AccessControlAllowOriginHeader),
		)
	})

	t.Run("with_allow_credentials", func(t *testing.T) {
		t.Parallel()

		middleware := middlewares.CorsMiddleware(middlewares.WithAllowCredentials(true))

		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		responseRecorder := httptest.NewRecorder()
		ctx := &httpfx.Context{
			Request:        req,
			ResponseWriter: responseRecorder,
			Results:        httpfx.Results{},
		}

		result := middleware(ctx)
		require.NotNil(t, result)

		assert.Equal(
			t,
			"true",
			responseRecorder.Header().Get(middlewares.AccessControlAllowCredentialsHeader),
		)
	})

	t.Run("with_allow_headers", func(t *testing.T) {
		t.Parallel()

		allowedHeaders := []string{"X-Custom-Header", "Content-Type"}
		middleware := middlewares.CorsMiddleware(middlewares.WithAllowHeaders(allowedHeaders))

		req := httptest.NewRequest(
			http.MethodOptions,
			"/test",
			nil,
		) // OPTIONS request often checks headers
		responseRecorder := httptest.NewRecorder()
		ctx := &httpfx.Context{
			Request:        req,
			ResponseWriter: responseRecorder,
			Results:        httpfx.Results{},
		}

		result := middleware(ctx)
		require.NotNil(t, result)

		assert.Equal(
			t,
			strings.Join(allowedHeaders, ", "),
			responseRecorder.Header().Get(middlewares.AccessControlAllowHeadersHeader),
		)
	})

	t.Run("with_allow_methods", func(t *testing.T) {
		t.Parallel()

		allowedMethods := []string{http.MethodGet, http.MethodPost, http.MethodPut}
		middleware := middlewares.CorsMiddleware(middlewares.WithAllowMethods(allowedMethods))

		req := httptest.NewRequest(
			http.MethodOptions,
			"/test",
			nil,
		) // OPTIONS request often checks methods
		responseRecorder := httptest.NewRecorder()
		ctx := &httpfx.Context{
			Request:        req,
			ResponseWriter: responseRecorder,
			Results:        httpfx.Results{},
		}

		result := middleware(ctx)
		require.NotNil(t, result)

		assert.Equal(
			t,
			strings.Join(allowedMethods, ", "),
			responseRecorder.Header().Get(middlewares.AccessControlAllowMethodsHeader),
		)
	})

	t.Run("with_multiple_options", func(t *testing.T) {
		t.Parallel()

		allowedOrigin := "https://sub.example.com"
		allowedHeaders := []string{"Authorization", "X-Requested-With"}
		allowedMethods := []string{http.MethodGet, http.MethodOptions}

		middleware := middlewares.CorsMiddleware(
			middlewares.WithAllowOrigin(allowedOrigin),
			middlewares.WithAllowCredentials(true),
			middlewares.WithAllowHeaders(allowedHeaders),
			middlewares.WithAllowMethods(allowedMethods),
		)

		req := httptest.NewRequest(http.MethodOptions, "/test", nil)
		responseRecorder := httptest.NewRecorder()
		ctx := &httpfx.Context{
			Request:        req,
			ResponseWriter: responseRecorder,
			Results:        httpfx.Results{},
		}

		result := middleware(ctx)
		require.NotNil(t, result)

		assert.Equal(
			t,
			allowedOrigin,
			responseRecorder.Header().Get(middlewares.AccessControlAllowOriginHeader),
		)
		assert.Equal(
			t,
			"true",
			responseRecorder.Header().Get(middlewares.AccessControlAllowCredentialsHeader),
		)
		assert.Equal(
			t,
			strings.Join(allowedHeaders, ", "),
			responseRecorder.Header().Get(middlewares.AccessControlAllowHeadersHeader),
		)
		assert.Equal(
			t,
			strings.Join(allowedMethods, ", "),
			responseRecorder.Header().Get(middlewares.AccessControlAllowMethodsHeader),
		)
	})

	// Original test cases, adapted for default behavior check
	// These can be simplified or removed if the "default_options" test is considered sufficient.
	originalTests := []struct {
		name   string
		method string
	}{
		{
			name:   "get_request_default_origin",
			method: http.MethodGet,
		},
		{
			name:   "post_request_default_origin",
			method: http.MethodPost,
		},
		{
			name:   "options_request_default_origin",
			method: http.MethodOptions,
		},
	}

	for _, tt := range originalTests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			req := httptest.NewRequest(tt.method, "/test", nil)
			responseRecorder := httptest.NewRecorder()
			ctx := &httpfx.Context{
				Request:        req,
				ResponseWriter: responseRecorder,
				Results:        httpfx.Results{},
			}

			middleware := middlewares.CorsMiddleware() // Test default
			result := middleware(ctx)
			require.NotNil(t, result)

			assert.Equal(
				t,
				"*",
				responseRecorder.Header().Get(middlewares.AccessControlAllowOriginHeader),
			)
		})
	}
}
