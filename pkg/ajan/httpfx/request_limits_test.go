package httpfx_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestParseJSONBodyRejectsOversizedBody pins that a request body is bounded even
// when no middleware limits it.
//
// RequestSizeLimitMiddleware exists but is wired into zero servers, and
// MaxRequestSizeMB was declared and never read, so ParseJSONBody decoded an
// unbounded body. That is reachable before authentication: /auth/login parses
// its request the same way, so an unauthenticated caller could stream until the
// process ran out of memory.
func TestParseJSONBodyRejectsOversizedBody(t *testing.T) {
	httpfx.SetMaxRequestBodyBytes(1 << 10)
	t.Cleanup(func() { httpfx.SetMaxRequestBodyBytes(0) })

	var target map[string]any

	body := `{"payload":"` + strings.Repeat("a", 4<<10) + `"}`
	request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	recorder := httptest.NewRecorder()

	ctx := &httpfx.Context{ //nolint:exhaustruct
		Request:        request,
		ResponseWriter: recorder,
	}

	err := ctx.ParseJSONBody(&target)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "too large")
}

// TestParseJSONBodyAcceptsBodyWithinLimit guards the other direction: bounding
// the read must not start rejecting ordinary requests.
func TestParseJSONBodyAcceptsBodyWithinLimit(t *testing.T) {
	httpfx.SetMaxRequestBodyBytes(1 << 10)
	t.Cleanup(func() { httpfx.SetMaxRequestBodyBytes(0) })

	var target map[string]any

	request := httptest.NewRequest(
		http.MethodPost,
		"/",
		strings.NewReader(`{"pin":"123456"}`),
	)
	recorder := httptest.NewRecorder()

	ctx := &httpfx.Context{ //nolint:exhaustruct
		Request:        request,
		ResponseWriter: recorder,
	}

	require.NoError(t, ctx.ParseJSONBody(&target))
	assert.Equal(t, "123456", target["pin"])
}

// TestMaxRequestBodyBytesDefaults pins that the limit is never "unlimited": an
// unset or zero configuration falls back to the documented default rather than
// to the unbounded read this exists to prevent.
func TestMaxRequestBodyBytesDefaults(t *testing.T) {
	httpfx.SetMaxRequestBodyBytes(0)
	assert.Equal(t, httpfx.DefaultMaxRequestBodyBytes, httpfx.MaxRequestBodyBytes())

	httpfx.SetMaxRequestBodyBytes(-1)
	assert.Equal(t, httpfx.DefaultMaxRequestBodyBytes, httpfx.MaxRequestBodyBytes())

	httpfx.SetMaxRequestBodyBytes(4096)
	assert.Equal(t, int64(4096), httpfx.MaxRequestBodyBytes())

	t.Cleanup(func() { httpfx.SetMaxRequestBodyBytes(0) })
}
