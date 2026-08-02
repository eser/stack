// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package healthcheck_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/httpfx/modules/healthcheck"
	"github.com/eser/stack/pkg/ajan/processfx"
)

func TestRegisterHTTPRoutes_Disabled(t *testing.T) {
	t.Parallel()

	router := httpfx.NewRouter("/")
	config := &httpfx.Config{ //nolint:exhaustruct
		HealthCheckEnabled: false,
	}
	healthcheck.RegisterHTTPRoutes(router, config)

	req := httptest.NewRequest(http.MethodGet, "/health-check", nil)
	rr := httptest.NewRecorder()
	router.GetMux().ServeHTTP(rr, req)

	// Route not registered → 404 or default mux behavior.
	if rr.Code == http.StatusNoContent {
		t.Error("route should not be registered when HealthCheckEnabled=false")
	}
}

func TestRegisterHTTPRoutes_SimpleHealthCheck(t *testing.T) {
	t.Parallel()

	router := httpfx.NewRouter("/")
	config := &httpfx.Config{ //nolint:exhaustruct
		HealthCheckEnabled: true,
	}
	healthcheck.RegisterHTTPRoutes(router, config)

	req := httptest.NewRequest(http.MethodGet, "/health-check", nil)
	rr := httptest.NewRecorder()
	router.GetMux().ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Errorf("expected 204 from /health-check, got %d", rr.Code)
	}
}

func TestRegisterHTTPRoutes_DetailedHealth_NoRegistry(t *testing.T) {
	// Not parallel — mutates package-level supervisorRegistry global.

	// No registry set → buildHealthResponse returns empty healthy response.
	healthcheck.SetSupervisorRegistry(nil)

	router := httpfx.NewRouter("/")
	config := &httpfx.Config{ //nolint:exhaustruct
		HealthCheckEnabled: true,
	}
	healthcheck.RegisterHTTPRoutes(router, config)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rr := httptest.NewRecorder()
	router.GetMux().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}

	var resp map[string]any

	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("expected valid JSON response: %v", err)
	}

	if resp["status"] != "healthy" {
		t.Errorf("expected status healthy, got %v", resp["status"])
	}
}

func TestRegisterHTTPRoutes_DetailedHealth_WithRegistry(t *testing.T) {
	// Not parallel — mutates package-level supervisorRegistry global.

	registry := processfx.NewSupervisorRegistry()
	cfg := processfx.DefaultSupervisedConfig("test-w")
	sup := processfx.NewSupervisor(cfg, nil, nil)
	registry.Register(sup)

	healthcheck.SetSupervisorRegistry(registry)
	t.Cleanup(func() { healthcheck.SetSupervisorRegistry(nil) })

	router := httpfx.NewRouter("/")
	config := &httpfx.Config{ //nolint:exhaustruct
		HealthCheckEnabled: true,
	}
	healthcheck.RegisterHTTPRoutes(router, config)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rr := httptest.NewRecorder()
	router.GetMux().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}

	var resp struct {
		Status  string                     `json:"status"`
		Workers map[string]json.RawMessage `json:"workers"`
		Summary *struct {
			Total   int `json:"total"`
			Healthy int `json:"healthy"`
		} `json:"summary"`
	}

	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("expected valid JSON: %v", err)
	}

	if resp.Status != "healthy" {
		t.Errorf("expected healthy, got %q", resp.Status)
	}

	if resp.Summary == nil {
		t.Fatal("expected summary in response")
	}

	if resp.Summary.Total != 1 {
		t.Errorf("expected total 1, got %d", resp.Summary.Total)
	}
}
