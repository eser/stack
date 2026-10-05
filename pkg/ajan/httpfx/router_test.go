package httpfx_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newTestRouter returns a router whose log of failed writes is discarded.
func newTestRouter() *httpfx.Router {
	return httpfx.NewRouter(logfx.NewLogger(logfx.WithWriter(io.Discard)))
}

func TestNewRouter(t *testing.T) {
	t.Parallel()

	router := newTestRouter()
	require.NotNil(t, router)
	assert.NotNil(t, router.GetMux())
	assert.Empty(t, router.GetHandlers())
	assert.Empty(t, router.GetRoutes())
}

func TestNewRouter_NilLogger(t *testing.T) {
	t.Parallel()

	assert.PanicsWithValue(
		t,
		"httpfx: NewRouter needs a logger; pass the service's *logfx.Logger",
		func() { httpfx.NewRouter(nil) },
	)
}

// The router has no prefix of its own: each pattern is served at exactly the
// path it names, through the mux the services mount.
func TestRouter_ServesPatternsAsWritten(t *testing.T) {
	t.Parallel()

	router := newTestRouter()

	router.Route("GET /users", func(ctx *httpfx.Context) httpfx.Result {
		return ctx.Results.PlainText([]byte("users"))
	})
	router.Route("GET /api/v1/users", func(ctx *httpfx.Context) httpfx.Result {
		return ctx.Results.PlainText([]byte("api users"))
	})
	router.RouteRaw("/api/v1/attach", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusAccepted)
	})

	tests := []struct {
		name       string
		method     string
		path       string
		wantStatus int
		wantBody   string
	}{
		{name: "top-level pattern", method: http.MethodGet, path: "/users", wantStatus: http.StatusOK, wantBody: "users"},
		{name: "nested pattern", method: http.MethodGet, path: "/api/v1/users", wantStatus: http.StatusOK, wantBody: "api users"},
		{name: "raw pattern", method: http.MethodConnect, path: "/api/v1/attach", wantStatus: http.StatusAccepted},
		{name: "no implicit prefix", method: http.MethodGet, path: "/api/users", wantStatus: http.StatusNotFound},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			req := httptest.NewRequestWithContext(t.Context(), tt.method, tt.path, nil)
			recorder := httptest.NewRecorder()
			router.GetMux().ServeHTTP(recorder, req)

			assert.Equal(t, tt.wantStatus, recorder.Code)

			if tt.wantBody != "" {
				assert.Equal(t, tt.wantBody, recorder.Body.String())
			}
		})
	}
}

func TestRouter_Use(t *testing.T) {
	t.Parallel()

	router := newTestRouter()
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
			router := newTestRouter()
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

	router := newTestRouter()
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
