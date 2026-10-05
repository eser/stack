package middlewares_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/httpfx/middlewares"
	"github.com/stretchr/testify/assert"
)

const testPinToken = "valid-token"

func newPinAuthRouter(isPINSetup bool) *httpfx.Router {
	router := newTestRouter()
	router.Use(middlewares.PinAuthMiddleware(
		func() bool { return isPINSetup },
		func(token string) bool { return token == testPinToken },
		func(ctx *httpfx.Context) bool { return ctx.Request.URL.Path == "/public" },
	))

	router.Route("GET /api/data", func(ctx *httpfx.Context) httpfx.Result {
		return ctx.Results.Ok()
	})

	router.Route("GET /public", func(ctx *httpfx.Context) httpfx.Result {
		return ctx.Results.Ok()
	})

	router.RouteRaw("/attach/{sid}", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	return router
}

func TestPinAuthMiddleware(t *testing.T) { //nolint:funlen // one table of cases
	t.Parallel()

	tests := []struct {
		name       string
		pinSetup   bool
		method     string
		target     string
		proto      string
		bearer     string
		wantStatus int
	}{
		{
			name:       "bearer header on a normal route",
			pinSetup:   true,
			method:     http.MethodGet,
			target:     "/api/data",
			bearer:     testPinToken,
			wantStatus: http.StatusNoContent,
		},
		{
			name:       "wrong bearer header on a normal route",
			pinSetup:   true,
			method:     http.MethodGet,
			target:     "/api/data",
			bearer:     "other-token",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "query token on a normal route is ignored",
			pinSetup:   true,
			method:     http.MethodGet,
			target:     "/api/data?token=" + testPinToken,
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "query token on a WebTransport CONNECT",
			pinSetup:   true,
			method:     http.MethodConnect,
			target:     "/attach/s1?token=" + testPinToken,
			proto:      "webtransport-h3",
			wantStatus: http.StatusOK,
		},
		{
			name:       "query token on a pre-draft-15 WebTransport CONNECT",
			pinSetup:   true,
			method:     http.MethodConnect,
			target:     "/attach/s1?token=" + testPinToken,
			proto:      "webtransport",
			wantStatus: http.StatusOK,
		},
		{
			name:       "wrong query token on a WebTransport CONNECT",
			pinSetup:   true,
			method:     http.MethodConnect,
			target:     "/attach/s1?token=other-token",
			proto:      "webtransport-h3",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "bearer header on a WebTransport CONNECT",
			pinSetup:   true,
			method:     http.MethodConnect,
			target:     "/attach/s1",
			proto:      "webtransport-h3",
			bearer:     testPinToken,
			wantStatus: http.StatusOK,
		},
		{
			name:       "query token on a raw route without CONNECT is ignored",
			pinSetup:   true,
			method:     http.MethodGet,
			target:     "/attach/s1?token=" + testPinToken,
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "query token on a CONNECT for another protocol is ignored",
			pinSetup:   true,
			method:     http.MethodConnect,
			target:     "/attach/s1?token=" + testPinToken,
			proto:      "websocket",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "skipped public route",
			pinSetup:   true,
			method:     http.MethodGet,
			target:     "/public",
			wantStatus: http.StatusNoContent,
		},
		{
			name:       "no PIN set up yet",
			pinSetup:   false,
			method:     http.MethodGet,
			target:     "/api/data",
			wantStatus: http.StatusNoContent,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			router := newPinAuthRouter(tt.pinSetup)

			req := httptest.NewRequestWithContext(t.Context(), tt.method, tt.target, nil)
			if tt.proto != "" {
				req.Proto = tt.proto
			}

			if tt.bearer != "" {
				req.Header.Set("Authorization", "Bearer "+tt.bearer)
			}

			recorder := httptest.NewRecorder()
			router.GetMux().ServeHTTP(recorder, req)

			assert.Equal(t, tt.wantStatus, recorder.Code)
		})
	}
}
