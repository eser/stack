package middlewares_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/httpfx/middlewares"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestErrorHandlerMiddlewareRecoversPanic pins that a panicking handler produces
// a 500 rather than escaping the chain.
//
// The middleware used to be a pure passthrough (`result := ctx.Next(); return
// result`) while being installed as the outermost middleware under the claim
// that it wraps everything.
func TestErrorHandlerMiddlewareRecoversPanic(t *testing.T) {
	t.Parallel()

	router := newTestRouter()
	router.Use(middlewares.ErrorHandlerMiddleware())
	router.Route("GET /boom", func(_ *httpfx.Context) httpfx.Result {
		panic("handler exploded")
	})

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/boom", nil)

	require.NotPanics(t, func() {
		router.GetMux().ServeHTTP(recorder, request)
	})

	assert.Equal(t, http.StatusInternalServerError, recorder.Code)
	// The panic text must not reach the client unless the operator opted in.
	assert.NotContains(t, recorder.Body.String(), "handler exploded")
}

// TestErrorHandlerMiddlewarePassesThroughNormalResults guards against the
// recovery changing the ordinary path.
func TestErrorHandlerMiddlewarePassesThroughNormalResults(t *testing.T) {
	t.Parallel()

	router := newTestRouter()
	router.Use(middlewares.ErrorHandlerMiddleware())
	router.Route("GET /fine", func(ctx *httpfx.Context) httpfx.Result {
		return ctx.Results.PlainText([]byte("all good"))
	})

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/fine", nil)

	router.GetMux().ServeHTTP(recorder, request)

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "all good")
}

// TestErrorHandlerMiddlewareLogsThePanicWithTheTraceID follows a panic from a
// request that arrives with a W3C traceparent header: TracingMiddleware joins
// the trace, ErrorHandlerMiddleware recovers the panic, and the router logs it
// once, with that trace id. On a raw route the response is then aborted.
func TestErrorHandlerMiddlewareLogsThePanicWithTheTraceID(t *testing.T) {
	t.Parallel()

	const (
		traceparent = "00-3f9fee6a47f52385bb27f916b1b4abb2-b7ad6b7169203331-01"
		traceID     = "3f9fee6a47f52385bb27f916b1b4abb2"
	)

	tests := []struct {
		name string
		raw  bool
	}{
		{name: "route", raw: false},
		{name: "raw route", raw: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			var logs bytes.Buffer

			logger := newTestLogger(&logs)
			router := httpfx.NewRouter(logger)
			router.Use(
				middlewares.TracingMiddleware(logger, ""),
				middlewares.ErrorHandlerMiddleware(),
			)

			method := http.MethodGet
			if tt.raw {
				method = http.MethodConnect

				router.RouteRaw("/boom", func(http.ResponseWriter, *http.Request) {
					panic("handler exploded")
				})
			} else {
				router.Route("GET /boom", func(*httpfx.Context) httpfx.Result {
					panic("handler exploded")
				})
			}

			req := httptest.NewRequestWithContext(t.Context(), method, "/boom", nil)
			req.Header.Set("Traceparent", traceparent)

			recorder := httptest.NewRecorder()

			if tt.raw {
				assert.PanicsWithValue(t, http.ErrAbortHandler, func() {
					router.GetMux().ServeHTTP(recorder, req)
				})
			} else {
				router.GetMux().ServeHTTP(recorder, req)

				assert.Equal(t, http.StatusInternalServerError, recorder.Code)
				assert.NotContains(t, recorder.Body.String(), "handler exploded")
			}

			var errorEntries []map[string]any

			for line := range strings.Lines(logs.String()) {
				var entry map[string]any

				require.NoError(t, json.Unmarshal([]byte(line), &entry), "log line %q", line)

				if entry["msg"] == "httpfx router: request error" {
					errorEntries = append(errorEntries, entry)
				}
			}

			require.Len(t, errorEntries, 1, "logged once: %s", logs.String())

			entry := errorEntries[0]
			assert.Equal(t, "ERROR", entry["level"])
			assert.Equal(t, traceID, entry["trace_id"])

			loggedError, _ := entry["error"].(map[string]any)
			assert.Equal(t, "handler panicked: handler exploded", loggedError["msg"])
		})
	}
}
