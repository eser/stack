package middlewares_test

import (
	"net/http"
	"net/http/httptest"
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

	router := httpfx.NewRouter("/")
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

	router := httpfx.NewRouter("/")
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
