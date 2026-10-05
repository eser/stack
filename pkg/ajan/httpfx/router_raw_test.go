// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

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

const rawTestContextKey httpfx.ContextKey = "raw-test"

// rawRecorder is a raw handler that counts its calls and answers 200 "raw".
type rawRecorder struct {
	calls   int
	request *http.Request
}

func (rec *rawRecorder) handle(w http.ResponseWriter, r *http.Request) {
	rec.calls++
	rec.request = r

	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("raw")) // the recorder's Write cannot fail
}

// serveRaw sends a CONNECT to /attach/s1, the request a WebTransport upgrade
// starts with.
func serveRaw(t *testing.T, router *httpfx.Router) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequestWithContext(t.Context(), http.MethodConnect, "/attach/s1", nil)
	recorder := httptest.NewRecorder()
	router.GetMux().ServeHTTP(recorder, req)

	return recorder
}

func TestRouter_RouteRaw(t *testing.T) {
	t.Parallel()

	passThrough := func(ctx *httpfx.Context) httpfx.Result {
		ctx.UpdateContext(context.WithValue(ctx.Request.Context(), rawTestContextKey, "set by middleware"))

		return ctx.Next()
	}

	reject := func(ctx *httpfx.Context) httpfx.Result {
		ctx.ResponseWriter.Header().Set("X-Rejected-By", "middleware")

		return ctx.Results.Error(http.StatusForbidden, httpfx.WithErrorMessage("forbidden"))
	}

	writeEarly := func(ctx *httpfx.Context) httpfx.Result {
		_ = ctx.WriteEarly(http.StatusUnauthorized, []byte("early")) // the recorder's Write cannot fail

		return ctx.Next()
	}

	tests := []struct {
		name         string
		middlewares  []httpfx.Handler
		wantStatus   int
		wantBody     string
		wantHeader   string
		wantRawCalls int
	}{
		{
			name:         "no middleware runs the raw handler",
			wantStatus:   http.StatusOK,
			wantBody:     "raw",
			wantRawCalls: 1,
		},
		{
			name:         "a passing chain runs the raw handler",
			middlewares:  []httpfx.Handler{passThrough},
			wantStatus:   http.StatusOK,
			wantBody:     "raw",
			wantRawCalls: 1,
		},
		{
			name:         "a rejection stops the raw handler",
			middlewares:  []httpfx.Handler{passThrough, reject},
			wantStatus:   http.StatusForbidden,
			wantBody:     `{"error":"forbidden"}`,
			wantHeader:   "middleware",
			wantRawCalls: 0,
		},
		{
			name:         "a WriteEarly answer stops the raw handler",
			middlewares:  []httpfx.Handler{writeEarly},
			wantStatus:   http.StatusUnauthorized,
			wantBody:     "early",
			wantRawCalls: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			router := newTestRouter()
			if len(tt.middlewares) > 0 {
				router.Use(tt.middlewares...)
			}

			raw := &rawRecorder{}
			router.RouteRaw("/attach/{sid}", raw.handle)

			recorder := serveRaw(t, router)

			assert.Equal(t, tt.wantStatus, recorder.Code)
			assert.Equal(t, tt.wantBody, recorder.Body.String())
			assert.Equal(t, tt.wantHeader, recorder.Header().Get("X-Rejected-By"))
			assert.Equal(t, tt.wantRawCalls, raw.calls)
		})
	}
}

// A rejection on a raw route must reach the client exactly as the same Result
// would from a Route: status, body, Content-Type and Location.
func TestRouter_RouteRaw_RejectionMatchesRoute(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		reject func(ctx *httpfx.Context) httpfx.Result
	}{
		{
			name: "json with a changed status",
			reject: func(ctx *httpfx.Context) httpfx.Result {
				result := ctx.Results.JSON(map[string]string{"error": "slow down"})
				result.InnerStatusCode = http.StatusTooManyRequests

				return result
			},
		},
		{
			name: "plain text",
			reject: func(ctx *httpfx.Context) httpfx.Result {
				return ctx.Results.Unauthorized(httpfx.WithPlainText("unauthorized"))
			},
		},
		{
			name: "redirect",
			reject: func(ctx *httpfx.Context) httpfx.Result {
				return ctx.Results.Redirect("/login")
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			router := newTestRouter()
			router.Use(tt.reject)
			router.Route("GET /normal", func(ctx *httpfx.Context) httpfx.Result {
				return ctx.Results.Ok()
			})

			raw := &rawRecorder{}
			router.RouteRaw("/attach/{sid}", raw.handle)

			normalReq := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/normal", nil)
			normal := httptest.NewRecorder()
			router.GetMux().ServeHTTP(normal, normalReq)

			rawResp := serveRaw(t, router)

			assert.Equal(t, 0, raw.calls)
			assert.Equal(t, normal.Code, rawResp.Code)
			assert.Equal(t, normal.Body.String(), rawResp.Body.String())
			assert.Equal(t, normal.Header().Get("Content-Type"), rawResp.Header().Get("Content-Type"))
			assert.Equal(t, normal.Header().Get("Location"), rawResp.Header().Get("Location"))
		})
	}
}

func TestRouter_RouteRaw_HandlerSeesMiddlewareContext(t *testing.T) {
	t.Parallel()

	router := newTestRouter()
	router.Use(func(ctx *httpfx.Context) httpfx.Result {
		ctx.UpdateContext(context.WithValue(ctx.Request.Context(), rawTestContextKey, "set by middleware"))

		return ctx.Next()
	})

	raw := &rawRecorder{}
	router.RouteRaw("/attach/{sid}", raw.handle)

	serveRaw(t, router)

	require.NotNil(t, raw.request)
	assert.Equal(t, "set by middleware", raw.request.Context().Value(rawTestContextKey))
	assert.Equal(t, "s1", raw.request.PathValue("sid"))
}

func TestRouter_RouteRaw_MiddlewareResumesAfterHandler(t *testing.T) {
	t.Parallel()

	var order []string

	router := newTestRouter()
	router.Use(func(ctx *httpfx.Context) httpfx.Result {
		order = append(order, "before")
		result := ctx.Next()
		order = append(order, "after")

		return result
	})
	router.RouteRaw("/attach/{sid}", func(w http.ResponseWriter, _ *http.Request) {
		order = append(order, "raw")
		w.WriteHeader(http.StatusOK)
	})

	recorder := serveRaw(t, router)

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, []string{"before", "raw", "after"}, order)
}

// A raw handler may have written part of a response or taken over the
// connection before it panicked, so a recovered panic aborts the response
// rather than writing the recovering middleware's Result on top.
func TestRouter_RouteRaw_RecoveredHandlerPanicAborts(t *testing.T) {
	t.Parallel()

	router := newTestRouter()
	router.Use(func(ctx *httpfx.Context) (result httpfx.Result) {
		defer func() {
			if recover() != nil {
				result = ctx.Results.Error(http.StatusInternalServerError)
			}
		}()

		return ctx.Next()
	})
	router.RouteRaw("/attach/{sid}", func(http.ResponseWriter, *http.Request) {
		panic("raw handler failed")
	})

	req := httptest.NewRequestWithContext(t.Context(), http.MethodConnect, "/attach/s1", nil)
	recorder := httptest.NewRecorder()

	assert.PanicsWithValue(t, http.ErrAbortHandler, func() {
		router.GetMux().ServeHTTP(recorder, req)
	})
	assert.Empty(t, recorder.Body.String())
}
