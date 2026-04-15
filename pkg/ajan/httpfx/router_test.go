package httpfx_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewRouter(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		path     string
		wantPath string
	}{
		{
			name:     "root_path",
			path:     "/",
			wantPath: "/",
		},
		{
			name:     "api_path",
			path:     "/api",
			wantPath: "/api",
		},
		{
			name:     "nested_path",
			path:     "/api/v1",
			wantPath: "/api/v1",
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			router := httpfx.NewRouter(tt.path)
			require.NotNil(t, router)
			assert.Equal(t, tt.wantPath, router.GetPath())
			assert.NotNil(t, router.GetMux())
			assert.Empty(t, router.GetHandlers())
			assert.Empty(t, router.GetRoutes())
		})
	}
}

func TestRouter_Group(t *testing.T) {
	t.Parallel()

	router := httpfx.NewRouter("/api")
	require.NotNil(t, router)

	v1Router := router.Group("/v1")
	require.NotNil(t, v1Router)
	assert.Equal(t, "/api/v1", v1Router.GetPath())

	usersRouter := v1Router.Group("/users")
	require.NotNil(t, usersRouter)
	assert.Equal(t, "/api/v1/users", usersRouter.GetPath())
}

func TestRouter_Use(t *testing.T) {
	t.Parallel()

	router := httpfx.NewRouter("/")
	require.NotNil(t, router)

	handler1 := func(ctx *httpfx.Context) httpfx.Result {
		return ctx.Results.PlainText([]byte("handler1"))
	}

	handler2 := func(ctx *httpfx.Context) httpfx.Result {
		return ctx.Results.PlainText([]byte("handler2"))
	}

	router.Use(handler1, handler2)

	handlers := router.GetHandlers()
	require.Len(t, handlers, 2)
	assert.NotNil(t, handlers[0])
	assert.NotNil(t, handlers[1])
}

func TestRouter_Route(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name           string
		pattern        string
		method         string
		path           string
		expectedStatus int
		expectedBody   string
	}{
		{
			name:           "simple_get",
			pattern:        "GET /test",
			method:         http.MethodGet,
			path:           "/test",
			expectedStatus: http.StatusOK,
			expectedBody:   "test",
		},
		{
			name:           "post_endpoint",
			pattern:        "POST /users",
			method:         http.MethodPost,
			path:           "/users",
			expectedStatus: http.StatusOK,
			expectedBody:   "test",
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			// Create a new router for each test case
			router := httpfx.NewRouter("/api")
			require.NotNil(t, router)

			handler := func(ctx *httpfx.Context) httpfx.Result {
				return ctx.Results.PlainText([]byte("test"))
			}

			route := router.Route(tt.pattern, handler)
			require.NotNil(t, route)

			// Create test request
			req := httptest.NewRequest(tt.method, tt.path, nil)
			w := httptest.NewRecorder() //nolint:varnamelen

			// Serve the request
			route.MuxHandlerFunc(w, req)

			assert.Equal(t, tt.expectedStatus, w.Code)
			assert.Equal(t, tt.expectedBody, w.Body.String())
		})
	}
}

func TestRouter_RouteWithMiddleware(t *testing.T) {
	t.Parallel()

	router := httpfx.NewRouter("/api")
	require.NotNil(t, router)

	// Middleware that adds a header
	middleware := func(ctx *httpfx.Context) httpfx.Result {
		ctx.ResponseWriter.Header().Set("X-Test", "middleware")

		return ctx.Next()
	}

	// Final handler
	handler := func(ctx *httpfx.Context) httpfx.Result {
		return ctx.Results.PlainText([]byte("test"))
	}

	router.Use(middleware)
	route := router.Route("GET /test", handler)
	require.NotNil(t, route)

	// Create test request
	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	w := httptest.NewRecorder() //nolint:varnamelen

	// Serve the request
	route.MuxHandlerFunc(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "test", w.Body.String())
	assert.Equal(t, "middleware", w.Header().Get("X-Test"))
}
