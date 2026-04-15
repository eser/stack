package httpfx_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestContext_HandlerChain(t *testing.T) {
	t.Parallel()

	router := httpfx.NewRouter("/")
	require.NotNil(t, router)

	// Track handler execution order
	var handlerCalls []int

	// Add middleware handlers
	router.Use(
		func(c *httpfx.Context) httpfx.Result {
			handlerCalls = append(handlerCalls, 1)

			return c.Next()
		},
		func(c *httpfx.Context) httpfx.Result {
			handlerCalls = append(handlerCalls, 2)

			return c.Next()
		},
	)

	// Add route handler
	router.Route("GET /test",
		func(c *httpfx.Context) httpfx.Result {
			handlerCalls = append(handlerCalls, 3)

			return c.Results.Ok()
		},
	)

	// Create test request
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder() //nolint:varnamelen

	// Serve the request
	router.GetMux().ServeHTTP(w, req)

	// Verify handlers were called in order
	assert.Equal(t, []int{1, 2, 3}, handlerCalls)
	assert.Equal(t, http.StatusNoContent, w.Code)
}

func TestContext_UpdateContext(t *testing.T) {
	t.Parallel()

	router := httpfx.NewRouter("/")
	require.NotNil(t, router)

	// Create a context key and value
	type key string

	testKey := key("test-key")
	testValue := "test-value"

	// Add a handler that updates and verifies the context
	var contextValue string

	router.Route("GET /test",
		func(c *httpfx.Context) httpfx.Result {
			// Update the context
			newCtx := context.WithValue(t.Context(), testKey, testValue)
			c.UpdateContext(newCtx)

			// Get the value from the updated context
			contextValue = c.Request.Context().Value(testKey).(string) //nolint:forcetypeassert

			return c.Results.Ok()
		},
	)

	// Create and serve test request
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder()
	router.GetMux().ServeHTTP(w, req)

	// Verify the context was updated correctly
	assert.Equal(t, testValue, contextValue)
}

func TestContext_Results(t *testing.T) {
	t.Parallel()

	// Test different result types
	tests := []struct {
		name           string
		path           string
		handler        httpfx.Handler
		expectedStatus int
		expectedBody   string
	}{
		{
			name: "ok_result",
			path: "/ok",
			handler: func(c *httpfx.Context) httpfx.Result {
				return c.Results.Ok()
			},
			expectedStatus: http.StatusNoContent,
			expectedBody:   "",
		},
		{
			name: "plain_text_result",
			path: "/text",
			handler: func(c *httpfx.Context) httpfx.Result {
				return c.Results.PlainText([]byte("hello"))
			},
			expectedStatus: http.StatusOK,
			expectedBody:   "hello",
		},
		{
			name: "error_result",
			path: "/error",
			handler: func(c *httpfx.Context) httpfx.Result {
				return c.Results.Error(http.StatusBadRequest, httpfx.WithPlainText("bad request"))
			},
			expectedStatus: http.StatusBadRequest,
			expectedBody:   "bad request",
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			// Create a new router for each test case
			router := httpfx.NewRouter("/")
			require.NotNil(t, router)

			// Add route
			router.Route("GET "+tt.path, tt.handler)

			// Create and serve test request
			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			w := httptest.NewRecorder()
			router.GetMux().ServeHTTP(w, req)

			// Verify response
			assert.Equal(t, tt.expectedStatus, w.Code)
			assert.Equal(t, tt.expectedBody, w.Body.String())
		})
	}
}
