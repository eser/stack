// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package profiling_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/httpfx/modules/profiling"
	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testProfilingToken = "test-profiling-token"

func serve(t *testing.T, router *httpfx.Router, target, authorization string) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, target, nil)
	if authorization != "" {
		req.Header.Set("Authorization", authorization)
	}

	recorder := httptest.NewRecorder()
	router.GetMux().ServeHTTP(recorder, req)

	return recorder
}

func TestRegisterHTTPRoutes_NotMounted(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		config  *httpfx.Config
		wantErr error
	}{
		{
			name: "profiling disabled",
			config: &httpfx.Config{
				ProfilingEnabled: false,
				ProfilingToken:   testProfilingToken,
			},
			wantErr: nil,
		},
		{
			name: "profiling enabled without a token",
			config: &httpfx.Config{
				ProfilingEnabled: true,
				ProfilingToken:   "",
			},
			wantErr: profiling.ErrProfilingTokenNotSet,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			router := newTestRouter()

			err := profiling.RegisterHTTPRoutes(router, tt.config)
			require.ErrorIs(t, err, tt.wantErr)

			recorder := serve(t, router, "/debug/pprof/", "Bearer "+testProfilingToken)
			assert.Equal(t, http.StatusNotFound, recorder.Code)
		})
	}
}

func TestRegisterHTTPRoutes_TokenGuard(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name          string
		target        string
		authorization string
		wantStatus    int
	}{
		{
			name:          "bearer token",
			target:        "/debug/pprof/",
			authorization: "Bearer " + testProfilingToken,
			wantStatus:    http.StatusOK,
		},
		{
			name:          "bearer token on a named profile",
			target:        "/debug/pprof/goroutine?debug=1",
			authorization: "Bearer " + testProfilingToken,
			wantStatus:    http.StatusOK,
		},
		{
			name:       "no authorization header",
			target:     "/debug/pprof/",
			wantStatus: http.StatusForbidden,
		},
		{
			name:          "wrong token",
			target:        "/debug/pprof/",
			authorization: "Bearer other-token",
			wantStatus:    http.StatusForbidden,
		},
		{
			name:          "prefix of the token",
			target:        "/debug/pprof/",
			authorization: "Bearer " + testProfilingToken[:4],
			wantStatus:    http.StatusForbidden,
		},
		{
			name:          "token with another scheme",
			target:        "/debug/pprof/",
			authorization: "Basic " + testProfilingToken,
			wantStatus:    http.StatusForbidden,
		},
		{
			name:          "empty bearer token",
			target:        "/debug/pprof/",
			authorization: "Bearer ",
			wantStatus:    http.StatusForbidden,
		},
		{
			name:       "token in the query string",
			target:     "/debug/pprof/?token=" + testProfilingToken,
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "cmdline without a token",
			target:     "/debug/pprof/cmdline",
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "cpu profile without a token",
			target:     "/debug/pprof/profile",
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "symbol without a token",
			target:     "/debug/pprof/symbol",
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "trace without a token",
			target:     "/debug/pprof/trace",
			wantStatus: http.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			router := newTestRouter()
			config := &httpfx.Config{
				ProfilingEnabled: true,
				ProfilingToken:   testProfilingToken,
			}
			require.NoError(t, profiling.RegisterHTTPRoutes(router, config))

			recorder := serve(t, router, tt.target, tt.authorization)

			assert.Equal(t, tt.wantStatus, recorder.Code)

			if tt.wantStatus == http.StatusForbidden {
				assert.NotContains(t, recorder.Body.String(), "goroutine")
			}
		})
	}
}

// newTestRouter returns a router whose log of failed writes is discarded.
func newTestRouter() *httpfx.Router {
	return httpfx.NewRouter(logfx.NewLogger(logfx.WithWriter(io.Discard)))
}
