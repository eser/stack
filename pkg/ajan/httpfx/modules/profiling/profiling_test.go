// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package profiling_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/httpfx/modules/profiling"
)

func TestRegisterHTTPRoutes_Disabled(t *testing.T) {
	t.Parallel()

	router := httpfx.NewRouter("/")
	config := &httpfx.Config{ //nolint:exhaustruct
		ProfilingEnabled: false,
	}
	profiling.RegisterHTTPRoutes(router, config)

	req := httptest.NewRequest(http.MethodGet, "/debug/pprof/", nil)
	rr := httptest.NewRecorder()
	router.GetMux().ServeHTTP(rr, req)

	if rr.Code == http.StatusOK {
		t.Error("route should not be registered when ProfilingEnabled=false")
	}
}

func TestRegisterHTTPRoutes_Enabled_NoToken(t *testing.T) {
	// Not parallel — t.Setenv modifies global process env.
	t.Setenv("PPROF_TOKEN", "")

	router := httpfx.NewRouter("/")
	config := &httpfx.Config{ //nolint:exhaustruct
		ProfilingEnabled: true,
	}
	profiling.RegisterHTTPRoutes(router, config)

	req := httptest.NewRequest(http.MethodGet, "/debug/pprof/", nil)
	rr := httptest.NewRecorder()
	router.GetMux().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200 from /debug/pprof/ with no token guard, got %d", rr.Code)
	}
}

func TestRegisterHTTPRoutes_Enabled_WithToken_Valid(t *testing.T) {
	// Not parallel — t.Setenv modifies global process env.
	t.Setenv("PPROF_TOKEN", "test-secret")

	router := httpfx.NewRouter("/")
	config := &httpfx.Config{ //nolint:exhaustruct
		ProfilingEnabled: true,
	}
	profiling.RegisterHTTPRoutes(router, config)

	req := httptest.NewRequest(http.MethodGet, "/debug/pprof/?token=test-secret", nil)
	rr := httptest.NewRecorder()
	router.GetMux().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200 with valid token, got %d", rr.Code)
	}
}

func TestRegisterHTTPRoutes_Enabled_WithToken_Invalid(t *testing.T) {
	// Not parallel — t.Setenv modifies global process env.
	t.Setenv("PPROF_TOKEN", "test-secret")

	router := httpfx.NewRouter("/")
	config := &httpfx.Config{ //nolint:exhaustruct
		ProfilingEnabled: true,
	}
	profiling.RegisterHTTPRoutes(router, config)

	req := httptest.NewRequest(http.MethodGet, "/debug/pprof/", nil)
	rr := httptest.NewRecorder()
	router.GetMux().ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("expected 403 with missing token, got %d", rr.Code)
	}
}
