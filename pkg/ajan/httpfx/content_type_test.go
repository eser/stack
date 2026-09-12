package httpfx_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/stretchr/testify/assert"
)

// TestJSONResultIsServedAsJSON pins the Content-Type of a JSON response.
//
// No Result carried a header, so the router wrote the body with none set and
// net/http fell back to sniffing. DetectContentType does not recognise JSON, so
// every Results.JSON response — including /openapi.json — went out as
// text/plain, which API tooling and browsers mis-handle.
func TestJSONResultIsServedAsJSON(t *testing.T) {
	t.Parallel()

	router := httpfx.NewRouter("/")
	router.Route("GET /payload", func(ctx *httpfx.Context) httpfx.Result {
		return ctx.Results.JSON(map[string]string{"hello": "world"})
	})

	recorder := httptest.NewRecorder()
	router.GetMux().ServeHTTP(
		recorder,
		httptest.NewRequest(http.MethodGet, "/payload", nil),
	)

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(
		t,
		httpfx.ContentTypeJSON,
		recorder.Header().Get("Content-Type"),
	)
	assert.JSONEq(t, `{"hello":"world"}`, recorder.Body.String())
}

// TestPlainTextResultIsServedAsPlainText keeps the other typed constructor
// honest.
func TestPlainTextResultIsServedAsPlainText(t *testing.T) {
	t.Parallel()

	router := httpfx.NewRouter("/")
	router.Route("GET /text", func(ctx *httpfx.Context) httpfx.Result {
		return ctx.Results.PlainText([]byte("hello"))
	})

	recorder := httptest.NewRecorder()
	router.GetMux().ServeHTTP(
		recorder,
		httptest.NewRequest(http.MethodGet, "/text", nil),
	)

	assert.Equal(
		t,
		httpfx.ContentTypePlainText,
		recorder.Header().Get("Content-Type"),
	)
}

// TestUntypedResultKeepsSniffing guards the compatibility promise: a result that
// does not know its type must not suddenly gain one.
func TestUntypedResultKeepsSniffing(t *testing.T) {
	t.Parallel()

	router := httpfx.NewRouter("/")
	router.Route("GET /bytes", func(ctx *httpfx.Context) httpfx.Result {
		return ctx.Results.Bytes([]byte("<html></html>"))
	})

	recorder := httptest.NewRecorder()
	router.GetMux().ServeHTTP(
		recorder,
		httptest.NewRequest(http.MethodGet, "/bytes", nil),
	)

	assert.NotEqual(
		t,
		httpfx.ContentTypeJSON,
		recorder.Header().Get("Content-Type"),
	)
}
